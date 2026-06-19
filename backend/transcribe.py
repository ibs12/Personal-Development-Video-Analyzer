"""Fetch a YouTube transcript via youtube-transcript-api (1.x).

Exposes `fetch_transcript()` for in-process use by the Flask app and a small
CLI (`python transcribe.py <video_id>`) that prints JSON to stdout for
backwards compatibility / debugging.
"""

import json
import sys
from typing import Any, Dict, List

from youtube_transcript_api import YouTubeTranscriptApi


def fetch_transcript(video_id: str) -> List[Dict[str, Any]]:
    """Return the raw transcript as a list of {text, start, duration} dicts.

    Raises on failure so callers can surface a meaningful error.
    """
    ytt_api = YouTubeTranscriptApi()
    fetched = ytt_api.fetch(video_id)          # FetchedTranscript
    return fetched.to_raw_data()               # list[dict]: text/start/duration


def combined_text(raw: List[Dict[str, Any]]) -> str:
    """Join transcript segments into a single plain-text string."""
    return " ".join(segment["text"] for segment in raw)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python transcribe.py <YouTubeVideoID>"}), flush=True)
        sys.exit(1)

    try:
        data = fetch_transcript(sys.argv[1])
        print(json.dumps(data, ensure_ascii=False), flush=True)
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 - CLI surfaces any failure as JSON
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), flush=True)
        sys.exit(2)
