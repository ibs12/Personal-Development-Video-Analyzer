# YouTube Key Takeaways

Paste a YouTube video URL and get an AI-distilled breakdown of it: action steps,
key insights, notable examples, and a summary — each linked to the exact moment
in the video. Built for personal-development talks, but works on any video with
a transcript.

- **Frontend:** React (Create React App) + Tailwind CSS
- **Backend:** Flask API that fetches the transcript and runs it through a
  two-pass Claude pipeline (extractor → verifier) for grounded takeaways.

## How it works

1. The frontend extracts the video ID from the URL and calls `POST /transcribe`.
2. The backend fetches the transcript via `youtube-transcript-api`.
3. The frontend sends the transcript to `POST /process-transcript`.
4. The backend runs a two-pass Claude pipeline (see [backend/transcript_processor.py](backend/transcript_processor.py)):
   - **Extractor** — Claude (Sonnet 4.6) reads the full timestamped transcript
     with *adaptive thinking* and *structured outputs*, extracting candidate
     action steps, insights, and examples, each cited with a timestamp, segment
     IDs, and a verbatim evidence quote. Tuned for recall.
   - **Verifier** — a second pass audits every candidate against the transcript,
     drops anything whose evidence isn't literally present, dedupes, ranks, and
     writes the final summary. The transcript is prompt-cached so this pass is
     cheap. Very long videos use map-reduce (extract per chunk, verify globally).
   - A literal-evidence post-check runs as a final hallucination safety net.
5. Results render alongside an embedded player; clicking any timestamp seeks the
   video to that moment.

## Prerequisites

- Node.js 18+
- Python 3.11+
- An Anthropic API key — https://console.anthropic.com/settings/keys

## Setup

### Backend

```bash
cd backend
python -m venv venv          # or reuse the existing ../venv
source venv/bin/activate
pip install -r ../requirements.txt

cp .env.example .env         # then add your ANTHROPIC_API_KEY
python app.py                # serves http://127.0.0.1:5000
```

Endpoints:

| Method | Path                  | Purpose                                  |
| ------ | --------------------- | ---------------------------------------- |
| GET    | `/health`             | Liveness check                           |
| POST   | `/transcribe`         | `{ "YouTubeVideoID": "..." }` → transcript |
| POST   | `/process-transcript` | `{ "transcript": [...] }` → AI insights  |

### Frontend

```bash
npm install
cp .env.example .env         # optional; defaults to http://127.0.0.1:5000
npm start                    # opens http://localhost:3000
```

## Configuration

| Variable                  | Where    | Default                 | Purpose                              |
| ------------------------- | -------- | ----------------------- | ------------------------------------ |
| `ANTHROPIC_API_KEY`       | backend  | —                       | Claude API key (required for AI)     |
| `CLAUDE_MODEL`            | backend  | `claude-sonnet-4-6`     | Model id (`claude-opus-4-8` for quality, `claude-haiku-4-5` for cost) |
| `CLAUDE_MAX_OUTPUT_TOKENS`| backend  | `16000`                 | Per-call output budget (incl. thinking) |
| `CLAUDE_EFFORT`           | backend  | `medium`                | Reasoning effort: `low`/`medium`/`high`/`max` (higher = better but slower) |
| `ALLOWED_ORIGINS`         | backend  | `http://localhost:3000` | Comma-separated CORS origins         |
| `PORT`                    | backend  | `5000`                  | Port the Flask server binds to       |
| `REACT_APP_API_BASE_URL`  | frontend | `http://127.0.0.1:5000` | Backend base URL                     |

> **macOS note:** Port 5000 is used by AirPlay Receiver. Either disable it
> (System Settings → General → AirDrop & Handoff → AirPlay Receiver) or run the
> backend on another port with `PORT=5001` and set
> `REACT_APP_API_BASE_URL=http://127.0.0.1:5001`.

## Notes

- `backend/sections.py` is a standalone experimental NLP script (spaCy / BART)
  that is **not** part of the web app and is not covered by `requirements.txt`.
- Transcript fetching depends on YouTube's public transcript endpoints, which
  may rate-limit or block server IPs on some hosting providers.
