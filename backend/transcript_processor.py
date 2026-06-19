"""Grounded takeaway extraction from video transcripts, powered by Claude.

Pipeline (a small multi-agent / multi-pass design):

  1. EXTRACTOR pass  - Claude reads the full transcript (with numbered, timestamped
     segments) and extracts candidate action steps, key insights, and examples,
     each cited with a timestamp, the segment IDs used, and a verbatim evidence
     quote. Tuned for recall.
  2. VERIFIER pass   - A second Claude call audits every candidate against the
     transcript: it drops anything whose evidence isn't literally present, dedupes,
     ranks by importance, and writes the final summary. Tuned for precision.

Modern techniques in use:
  - Structured outputs (`messages.parse`) so the model returns schema-valid JSON.
  - Adaptive (extended) thinking for the reasoning-heavy extraction.
  - Prompt caching of the transcript, so the verifier pass reuses it cheaply.
  - Map-reduce for very long transcripts: extract per chunk, then verify/merge
    globally. (Full classic RAG/embeddings isn't used - we're extracting *from*
    one document that fits comfortably in Claude's context, so long-context +
    caching beats chopping the transcript into retrieved fragments.)
  - A literal-evidence post-check as a final hallucination safety net.

The public surface (`PersonalDevelopmentProcessor.process_transcript`) and the
returned JSON shape are unchanged, so the Flask app and frontend are untouched.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import anthropic
from pydantic import BaseModel, Field

# Default model. Override at runtime with CLAUDE_MODEL (e.g. claude-opus-4-8 for
# higher quality, or claude-haiku-4-5 for lower cost) without editing code.
DEFAULT_MODEL = "claude-sonnet-4-6"

# Output-token budget. Adaptive thinking draws from this too, so keep it generous.
DEFAULT_MAX_OUTPUT_TOKENS = 16000

# Reasoning effort: low | medium | high | max. Higher = better quality but slower
# and pricier. `medium` is a good balance for extraction; Sonnet defaults to high.
DEFAULT_EFFORT = "medium"

# Above this transcript size (characters) we switch to map-reduce extraction:
# extract per chunk, then verify/merge globally. ~180k chars ≈ ~45k tokens.
CHUNK_THRESHOLD_CHARS = 180_000
CHUNK_SIZE_CHARS = 120_000


# ----------------------------
# Output schema (structured)
# ----------------------------

class ActionItemModel(BaseModel):
    action: str = Field(..., description="Concrete, immediately implementable action.")
    explanation: str = Field("", description="How to implement / why it matters.")
    timestamp: str = Field(..., description="Seconds (string) matching a transcript line start.")
    source_segment_ids: List[int] = Field(default_factory=list, description="IDs of transcript segments used.")
    evidence: str = Field("", description="Exact quote snippet from transcript supporting this item.")

class KeyInsightModel(BaseModel):
    keyInsight: str = Field(..., description="Memorable insight (not an action).")
    timestamp: str = Field(..., description="Seconds (string) matching a transcript line start.")
    source_segment_ids: List[int] = Field(default_factory=list, description="IDs of transcript segments used.")
    evidence: str = Field("", description="Exact quote snippet from transcript supporting this insight.")

class ExampleModel(BaseModel):
    example: str = Field(..., description="Example/story/analogy used by speaker.")
    timestamp: str = Field(..., description="Seconds (string) matching a transcript line start.")
    source_segment_ids: List[int] = Field(default_factory=list, description="IDs of transcript segments used.")
    evidence: str = Field("", description="Exact quote snippet from transcript supporting this example.")

class ProcessedContentModel(BaseModel):
    summary: str = Field(..., description="Concise summary + key takeaways. No markdown.")
    action_steps: List[ActionItemModel] = Field(default_factory=list)
    key_insights: List[KeyInsightModel] = Field(default_factory=list)
    examples: List[ExampleModel] = Field(default_factory=list)


# ----------------------------
# Output dataclasses (response contract — unchanged)
# ----------------------------

@dataclass
class ActionItem:
    action: str
    explanation: str = ""
    timestamp: str = ""
    source_segment_ids: Optional[List[int]] = None
    evidence: str = ""

@dataclass
class KeyInsight:
    keyInsight: str
    timestamp: str = ""
    source_segment_ids: Optional[List[int]] = None
    evidence: str = ""

@dataclass
class Example:
    example: str
    timestamp: str = ""
    source_segment_ids: Optional[List[int]] = None
    evidence: str = ""

@dataclass
class ProcessedContent:
    action_steps: List[ActionItem]
    key_insights: List[KeyInsight]
    examples: List[Example]
    summary: str

    def to_dict(self) -> Dict[str, Any]:
        def _ids(x):
            return [] if x is None else x

        return {
            "summary": self.summary,
            "action_steps": [
                {
                    "action": s.action,
                    "explanation": s.explanation,
                    "timestamp": s.timestamp,
                    "source_segment_ids": _ids(s.source_segment_ids),
                    "evidence": s.evidence,
                }
                for s in self.action_steps
            ],
            "key_insights": [
                {
                    "keyInsight": k.keyInsight,
                    "timestamp": k.timestamp,
                    "source_segment_ids": _ids(k.source_segment_ids),
                    "evidence": k.evidence,
                }
                for k in self.key_insights
            ],
            "examples": [
                {
                    "example": e.example,
                    "timestamp": e.timestamp,
                    "source_segment_ids": _ids(e.source_segment_ids),
                    "evidence": e.evidence,
                }
                for e in self.examples
            ],
        }


# ----------------------------
# Prompts
# ----------------------------

SYSTEM_PREAMBLE = (
    "You are a precision analyst that distills personal-development video "
    "transcripts into actionable, strictly grounded takeaways. You never invent "
    "facts, quotes, timestamps, or segment IDs — every item you output must be "
    "supported by the transcript provided. The transcript's lines are formatted "
    "as: (segment_id) [seconds] text. Follow the specific task in the user message."
)

EXTRACT_PROMPT = """TASK: Extract candidate takeaways from the transcript above.

Produce:
- summary: a 2-4 sentence plain-text overview (no markdown).
- action_steps: concrete, implementable actions the speaker recommends, each with a short explanation.
- key_insights: memorable, non-obvious ideas (not actions).
- examples: stories, analogies, or case studies the speaker uses to make a point.

For EVERY item:
- timestamp: the exact [seconds] value of the segment where it appears (as a string).
- source_segment_ids: the (segment_id) numbers you drew from.
- evidence: a short verbatim quote (<= 20 words) copied EXACTLY from the transcript.

Favor recall here — capture everything plausibly supported; a later verification
step will prune. Never fabricate. If a category has nothing, return an empty list."""

VERIFY_PROMPT = """TASK: You are the verifier. Below are CANDIDATE takeaways extracted from the
transcript above. Produce the FINAL, high-quality set.

Rules:
- DROP any item whose `evidence` is not a verbatim substring of the transcript, or
  whose `timestamp` does not match a real [seconds] value in the transcript.
- DROP vague, redundant, or low-value items. Deduplicate aggressively.
- RANK by importance and keep only the best: 3-7 action_steps, 3-8 key_insights,
  and up to 5 examples.
- Rewrite `summary` as a tight 2-4 sentence overview of the video's core message
  (plain text, no markdown).
- Preserve accurate timestamp, source_segment_ids, and evidence for every item kept.

CANDIDATES (JSON):
{candidates_json}"""


# ----------------------------
# Processor
# ----------------------------

class PersonalDevelopmentProcessor:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        max_output_tokens: Optional[int] = None,
        effort: Optional[str] = None,
    ):
        # The Anthropic SDK reads ANTHROPIC_API_KEY from the environment when no
        # key is passed explicitly.
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
        self.model = model or os.getenv("CLAUDE_MODEL", DEFAULT_MODEL)
        self.max_output_tokens = max_output_tokens or int(
            os.getenv("CLAUDE_MAX_OUTPUT_TOKENS", str(DEFAULT_MAX_OUTPUT_TOKENS))
        )
        self.effort = effort or os.getenv("CLAUDE_EFFORT", DEFAULT_EFFORT)

    # ---- transcript formatting ----

    def _normalize_transcript(self, transcript: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        norm: List[Dict[str, Any]] = []
        for i, item in enumerate(transcript, start=1):
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            start_val = item.get("start", "")
            try:
                start_str = f"{float(start_val):.3f}".rstrip("0").rstrip(".")
            except (TypeError, ValueError):
                start_str = str(start_val)
            norm.append({"id": i, "start": start_str, "text": text})
        return norm

    def _format(self, norm: List[Dict[str, Any]]) -> str:
        return "\n".join(f"({x['id']}) [{x['start']}] {x['text']}" for x in norm)

    def _system(self, formatted_transcript: str) -> List[Dict[str, Any]]:
        """System blocks: stable preamble + the transcript (cached for reuse)."""
        return [
            {"type": "text", "text": SYSTEM_PREAMBLE},
            {
                "type": "text",
                "text": f"TRANSCRIPT:\n{formatted_transcript}",
                "cache_control": {"type": "ephemeral"},
            },
        ]

    def _chunks(self, norm: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        chunks: List[List[Dict[str, Any]]] = []
        current: List[Dict[str, Any]] = []
        size = 0
        for seg in norm:
            line_len = len(seg["text"]) + 20
            if current and size + line_len > CHUNK_SIZE_CHARS:
                chunks.append(current)
                current, size = [], 0
            current.append(seg)
            size += line_len
        if current:
            chunks.append(current)
        return chunks

    # ---- Claude call (streaming) ----

    def _pass(self, system: List[Dict[str, Any]], user_text: str):
        """Stream one Claude pass.

        Yields the model's reasoning text as it arrives (thinking deltas), and
        stores the final structured result on ``self._pass_result``. Retries once
        without ``display`` if the model rejects it. Raises on a safety refusal.
        """
        self._pass_result = None
        # `effort` errors on Haiku, so only send it for models that accept it.
        output_config: Dict[str, Any] = {} if "haiku" in self.model else {"effort": self.effort}
        last_error: Optional[Exception] = None

        for use_display in (True, False):
            thinking: Dict[str, Any] = {"type": "adaptive"}
            if use_display:
                thinking["display"] = "summarized"  # stream readable reasoning
            try:
                with self.client.messages.stream(
                    model=self.model,
                    max_tokens=self.max_output_tokens,
                    thinking=thinking,
                    output_config=output_config,  # merged with the structured-output format
                    system=system,
                    messages=[{"role": "user", "content": user_text}],
                    output_format=ProcessedContentModel,
                ) as stream:
                    for event in stream:
                        if event.type == "content_block_delta" and getattr(event.delta, "type", "") == "thinking_delta":
                            text = getattr(event.delta, "thinking", "")
                            if text:
                                yield text
                    final = stream.get_final_message()
                if final.stop_reason == "refusal":
                    raise RuntimeError("Claude declined to process this transcript (safety refusal).")
                self._pass_result = final.parsed_output  # None if truncated/empty
                return
            except anthropic.BadRequestError as e:
                if use_display and "display" in str(e).lower():
                    last_error = e
                    continue  # retry without display
                raise
        if last_error:
            raise last_error

    # ---- post-validation ----

    def _post_validate_evidence(
        self, norm: List[Dict[str, Any]], parsed: ProcessedContentModel
    ) -> ProcessedContentModel:
        """Drop evidence strings that don't literally appear in the transcript text."""
        haystack = "\n".join(x["text"] for x in norm)

        def ok(ev: str) -> bool:
            ev = (ev or "").strip()
            return (not ev) or (ev in haystack)

        for group in (parsed.action_steps, parsed.key_insights, parsed.examples):
            for item in group:
                if not ok(item.evidence):
                    item.evidence = ""
                    item.source_segment_ids = []
        return parsed

    # ---- public API ----

    def stream_process(self, transcript: List[Dict[str, Any]]):
        """Run the two-pass pipeline, yielding progress events for the frontend.

        Event shapes:
          {"type": "status",   "stage": str, "label": str}
          {"type": "thinking", "text": str}           # incremental reasoning
          {"type": "result",   "data": {...}}         # final structured takeaways
          {"type": "error",    "message": str}
        """
        try:
            if not isinstance(transcript, list) or not transcript:
                yield {"type": "error", "message": "Transcript must be a non-empty array of objects."}
                return
            norm = self._normalize_transcript(transcript)
            if not norm:
                yield {"type": "error", "message": "Transcript contained no usable text."}
                return

            formatted_full = self._format(norm)

            # --- Pass 1: EXTRACT (map) ---
            candidates = ProcessedContentModel(summary="")
            if len(formatted_full) <= CHUNK_THRESHOLD_CHARS:
                yield {"type": "status", "stage": "extract",
                       "label": "Reading the transcript and pulling out candidates…"}
                for text in self._pass(self._system(formatted_full), EXTRACT_PROMPT):
                    yield {"type": "thinking", "text": text}
                candidates = self._pass_result or candidates
            else:
                chunks = self._chunks(norm)
                for i, chunk in enumerate(chunks, 1):
                    yield {"type": "status", "stage": "extract",
                           "label": f"Analyzing part {i} of {len(chunks)}…"}
                    for text in self._pass(self._system(self._format(chunk)), EXTRACT_PROMPT):
                        yield {"type": "thinking", "text": text}
                    part = self._pass_result
                    if part:
                        candidates.action_steps.extend(part.action_steps)
                        candidates.key_insights.extend(part.key_insights)
                        candidates.examples.extend(part.examples)

            # --- Pass 2: VERIFY (reduce/grade) ---
            yield {"type": "status", "stage": "verify",
                   "label": "Verifying every claim against the transcript…"}
            candidates_json = json.dumps(candidates.model_dump(), ensure_ascii=False, indent=2)
            for text in self._pass(self._system(formatted_full),
                                   VERIFY_PROMPT.format(candidates_json=candidates_json)):
                yield {"type": "thinking", "text": text}
            final = self._pass_result or candidates
            final = self._post_validate_evidence(norm, final)

            processed = ProcessedContent(
                summary=(final.summary or "").strip(),
                action_steps=[
                    ActionItem(a.action, a.explanation, a.timestamp, a.source_segment_ids, a.evidence)
                    for a in final.action_steps
                ],
                key_insights=[
                    KeyInsight(k.keyInsight, k.timestamp, k.source_segment_ids, k.evidence)
                    for k in final.key_insights
                ],
                examples=[
                    Example(e.example, e.timestamp, e.source_segment_ids, e.evidence)
                    for e in final.examples
                ],
            )
            yield {"type": "result", "data": processed.to_dict()}

        except anthropic.AuthenticationError:
            yield {"type": "error", "message": "Invalid or missing ANTHROPIC_API_KEY."}
        except anthropic.RateLimitError:
            yield {"type": "error", "message": "Claude is rate-limited right now. Please retry shortly."}
        except anthropic.APIError as e:
            yield {"type": "error", "message": f"Claude API error: {getattr(e, 'message', str(e))}"}
        except Exception as e:  # noqa: BLE001 - report a clean error to the client
            yield {"type": "error", "message": f"Processing error: {str(e)}"}

    def process_transcript(self, transcript: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Non-streaming convenience wrapper (CLI / tests): drain the stream."""
        result: Dict[str, Any] = {"status": "error", "message": "No result produced."}
        for event in self.stream_process(transcript):
            if event["type"] == "result":
                result = {"status": "success", "data": event["data"]}
            elif event["type"] == "error":
                result = {"status": "error", "message": event["message"]}
        return result
