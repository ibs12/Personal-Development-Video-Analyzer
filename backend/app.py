from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
from transcript_processor import PersonalDevelopmentProcessor
import os 
app = Flask(__name__)

# Configure CORS with credentials support
CORS(app, 
     resources={
         r"/*": {
             "origins": ["http://localhost:3000"],
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization"],
             "supports_credentials": True,
             "expose_headers": ["Access-Control-Allow-Credentials"],
             "allow_credentials": True
         }
     })

@app.route('/transcribe', methods=['POST'])
def fetch_transcript():
    youtube_url = request.json.get('YouTubeVideoURL')
    if not youtube_url:
        return jsonify({"message": "YouTubeVideoURL is required."}), 400
    
    try:
        result = subprocess.run(['python', 'transcribe.py', youtube_url])

        if result.returncode == 0:
            with open("transcript.txt", "r") as file:
                transcript = file.read().strip()
            return jsonify({"message": "Transcription completed successfully.", "transcript": transcript}), 200
        else:
            return jsonify({"message": "Transcription failed."}), 500
    except Exception as e:
        return jsonify({"message": str(e)}), 500

api_key= os.getenv('GOOGLE_API_KEY')
processor = PersonalDevelopmentProcessor(api_key = api_key)

@app.route('/process-transcript', methods=['POST'])
def process_transcript():
    try:
        data = request.get_json()
        transcript = data.get('transcript')
        
        if not transcript:
            return jsonify({"status": "error", "message": "No transcript provided"}), 400

        result = processor.process_transcript(transcript)
        
        # Add explicit CORS headers including credentials
        response = jsonify(result)
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        
        return response

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)