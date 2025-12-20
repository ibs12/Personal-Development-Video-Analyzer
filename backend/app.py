from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
from transcript_processor import PersonalDevelopmentProcessor
import os
import json

app = Flask(__name__)


# Configure CORS
CORS(
    app,
    resources={r"/*": {"origins": "http://localhost:3000"}},
    supports_credentials=True
)
from pathlib import Path
import sys

@app.route('/transcribe', methods=['POST'])
def fetch_transcript():
    data = request.get_json(silent=True) or {}
    youtube_id = data.get('YouTubeVideoID')
    if not youtube_id:
        return jsonify({"message": "YouTubeVideoID is required."}), 400

    print(f"Received YouTube ID: {youtube_id}")

    try:
        # Always use the same interpreter running Flask (venv-safe)
        script_path = Path(__file__).with_name("transcribe.py")

        result = subprocess.run(
            [sys.executable, str(script_path), youtube_id],
            capture_output=True,
            text=True
        )

        stdout = (result.stdout or "").strip()
        stderr = (result.stderr or "").strip()

        # 🔥 THIS is where it fits: immediately after subprocess.run
        if result.returncode != 0 or not stdout:
            return jsonify({
                "message": "transcribe.py did not return JSON on stdout",
                "returncode": result.returncode,
                "stdout": stdout,
                "stderr": stderr
            }), 500

        # Parse stdout JSON
        try:
            structured_transcript = json.loads(stdout)
        except json.JSONDecodeError as e:
            return jsonify({
                "message": f"Error decoding JSON: {str(e)}",
                "stdout": stdout,
                "stderr": stderr
            }), 500

        # If script returned {"error": "..."} instead of a list
        if isinstance(structured_transcript, dict) and "error" in structured_transcript:
            return jsonify({
                "message": "Transcript fetch failed",
                "details": structured_transcript["error"],
                "stderr": stderr
            }), 500

        # Filter out [Music] safely
        structured_transcript = [
            item for item in structured_transcript
            if isinstance(item, dict) and item.get("text") != "[Music]"
        ]

        # Read combined text written by transcribe.py
        try:
            with open("transcript.txt", "r", encoding="utf-8") as file:
                combined_text = file.read().strip()
        except FileNotFoundError:
            combined_text = ""

        return jsonify({
            "message": "Transcription completed successfully.",
            "combined_text": combined_text,
            "structured_transcript": structured_transcript
        }), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500






api_key = os.getenv('GOOGLE_API_KEY')
processor = PersonalDevelopmentProcessor(api_key=api_key)

@app.route('/process-transcript', methods=['POST'])
def process_transcript():
    try:
        data = request.get_json()
        transcript = data.get('transcript')
        
        if not transcript:
            return jsonify({"status": "error", "message": "No transcript provided"}), 400
            
        # Validate transcript format
        if not isinstance(transcript, list):
            return jsonify({"status": "error", "message": "Transcript must be an array of objects"}), 400
            
        for item in transcript:
            if not isinstance(item, dict) or 'text' not in item or 'start' not in item:
                return jsonify({"status": "error", "message": "Invalid transcript format"}), 400

        result = processor.process_transcript(transcript)
        return jsonify(result)

    except Exception as e:
        print(f"Error in process_transcript endpoint: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=False, host="127.0.0.1", port=5000)
