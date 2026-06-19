import json
import os

from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS

# Load variables from a local .env file if python-dotenv is installed.
# Optional: in production the platform usually injects env vars directly.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from transcribe import combined_text, fetch_transcript
from transcript_processor import PersonalDevelopmentProcessor

app = Flask(__name__)

# Allowed CORS origins are configurable via ALLOWED_ORIGINS (comma-separated).
# Defaults to the Create React App dev server.
_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
CORS(app, resources={r"/*": {"origins": _origins}}, supports_credentials=True)


# Models and effort levels the frontend may request. Anything else falls back to
# the processor default. (Haiku is intentionally not offered here because it
# doesn't support the adaptive-thinking / effort path the live reasoning UI uses;
# power users can still set CLAUDE_MODEL via the environment.)
ALLOWED_MODELS = {"claude-sonnet-4-6", "claude-opus-4-8"}
ALLOWED_EFFORTS = {"low", "medium", "high"}


def build_processor(model=None, effort=None):
    """Construct a processor for this request, validating client-supplied options."""
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Add it to your environment or a .env file."
        )
    model = model if model in ALLOWED_MODELS else None
    effort = effort if effort in ALLOWED_EFFORTS else None
    return PersonalDevelopmentProcessor(model=model, effort=effort)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/transcribe", methods=["POST"])
def transcribe():
    data = request.get_json(silent=True) or {}
    youtube_id = data.get("YouTubeVideoID")
    if not youtube_id:
        return jsonify({"message": "YouTubeVideoID is required."}), 400

    try:
        raw = fetch_transcript(youtube_id)
    except Exception as exc:  # noqa: BLE001 - report any fetch failure to the client
        return jsonify({"message": "Transcript fetch failed", "details": str(exc)}), 500

    # Filter out non-spoken markers such as [Music].
    structured_transcript = [
        item for item in raw if isinstance(item, dict) and item.get("text") != "[Music]"
    ]

    return jsonify(
        {
            "message": "Transcription completed successfully.",
            "combined_text": combined_text(structured_transcript),
            "structured_transcript": structured_transcript,
        }
    ), 200


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


@app.route("/process-transcript", methods=["POST"])
def process_transcript():
    """Stream the two-pass pipeline as Server-Sent Events.

    Emits `status`, `thinking`, `result`, and `error` events so the frontend can
    show Claude's reasoning live and then render the final takeaways.
    """
    data = request.get_json(silent=True) or {}
    transcript = data.get("transcript")
    model = data.get("model")
    effort = data.get("effort")

    if not isinstance(transcript, list) or not transcript:
        return jsonify({"status": "error", "message": "Transcript must be a non-empty array"}), 400
    for item in transcript:
        if not isinstance(item, dict) or "text" not in item or "start" not in item:
            return jsonify({"status": "error", "message": "Invalid transcript format"}), 400

    try:
        processor = build_processor(model=model, effort=effort)
    except RuntimeError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500

    def generate():
        try:
            for event in processor.stream_process(transcript):
                yield _sse(event)
        except Exception as exc:  # noqa: BLE001 - surface as a stream error event
            print(f"Error in process_transcript stream: {exc}")
            yield _sse({"type": "error", "message": str(exc)})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    # On modern macOS, port 5000 is used by AirPlay Receiver; override with PORT.
    port = int(os.getenv("PORT", "5000"))
    # threaded=True so a long-running SSE stream doesn't block other requests.
    app.run(debug=False, host="127.0.0.1", port=port, threaded=True)
