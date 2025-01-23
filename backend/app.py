from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
from transcript_processor import PersonalDevelopmentProcessor
import os
import json

app = Flask(__name__)
app.run(debug=False)

# Configure CORS
CORS(
    app,
    resources={r"/*": {"origins": "http://localhost:3000"}},
    supports_credentials=True
)

@app.route('/transcribe', methods=['POST'])
def fetch_transcript():
    youtube_id = request.json.get('YouTubeVideoID')
    if not youtube_id:
        return jsonify({"message": "YouTubeVideoID is required."}), 400

    print(f"Received YouTube URL: {youtube_id}")  # Debug log
    
    try:
        # Run the transcription script
        result = subprocess.run(['python', 'transcribe.py', youtube_id], capture_output=True, text=True)

        if result.returncode == 0:
            # Log the raw output for debugging purposes
            print(f"Raw stdout: {result.stdout}")
            
            # Clean the stdout output: strip any unwanted characters or extra spaces
            cleaned_stdout = result.stdout.strip()
            
            # Attempt to parse the cleaned output as JSON
            try:
                structured_transcript = json.loads(cleaned_stdout)
                
                # Optionally filter out unwanted elements like non-speech text
                structured_transcript = [item for item in structured_transcript if item['text'] != '[Music]']
                
                print(f"Structured Transcript: {structured_transcript}")  # Debug log
                
            except json.JSONDecodeError as e:
                return jsonify({"message": f"Error decoding JSON: {str(e)}", "stdout": cleaned_stdout}), 500
            
            # Read combined text from the file
            with open("transcript.txt", "r") as file:
                combined_text = file.read().strip()

            return jsonify({
                "message": "Transcription completed successfully.",
                "combined_text": combined_text,
                "structured_transcript": structured_transcript
            }), 200
        else:
            return jsonify({"message": "Transcription failed."}), 500
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
    app.run(debug=True)
