import sys
import logging
# from pytube import YouTube
# from pytubefix import YouTube
# from pytubefix.cli import on_progress
# import whisper
# from pydub import AudioSegment
import os
from transformers import BartForConditionalGeneration, BartTokenizer
from youtube_transcript_api import YouTubeTranscriptApi
import json


# Configure logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger()

# from pytube import YouTube
# from pytubefix.exceptions import VideoUnavailable

# import yt_dlp
# import logging

# def download_youtube_audio(youtube_url, output_path):
#     ydl_opts = {
#         'format': 'bestaudio/best',
#         'outtmpl': output_path,
#         'postprocessors': [{
#             'key': 'FFmpegExtractAudio',
#             'preferredcodec': 'mp3',
#             'preferredquality': '192',
#         }],
#         'quiet': True,  # Suppress output from yt-dlp
#         'logtostderr': False  # Prevent logs from being printed to stderr
#     }
#     try:
#         with yt_dlp.YoutubeDL(ydl_opts) as ydl:
#             ydl.download([youtube_url])
#         logger.info(f"Audio downloaded successfully: {output_path}")
#     except yt_dlp.utils.DownloadError as e:
#         logger.error(f"Download error: {e}")
#         raise

# def transcribe_youtube_video(youtube_url):
#     try:
#         # Suppress Whisper logs
#         logging.getLogger("whisper").setLevel(logging.CRITICAL)  # Only show critical errors

#         # Download the audio from YouTube
#         audio_file_name = "audio"  # Ensure correct path with extension
#         download_youtube_audio(youtube_url, audio_file_name)

#         # Load the Whisper model and transcribe the audio
#         model = whisper.load_model("base")
#         logger.info("Whisper model loaded successfully.")

#         audio_file_path = "audio.mp3"  # Ensure correct path with extension

#         result = model.transcribe(audio_file_path)
#         logger.info("Transcription completed successfully.")

#         # Optionally remove the downloaded audio file after transcription
#         os.remove(audio_file_path)
        
#         transcript = result['text']
#         with open("transcript.txt", "w") as file:
#             file.write(transcript)
#         return result['text']
#     except Exception as e:
#         logger.error(f"Error in transcription: {e}")
#         raise

from youtube_transcript_api import YouTubeTranscriptApi

import json

def get_transcript(video_id):
    try:
        # Fetch transcript using YouTubeTranscriptApi
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        
        # Save combined text to a file
        combined_text = ' '.join(part['text'] for part in transcript)
        with open("transcript.txt", "w") as file:
            file.write(combined_text)

        # Return structured transcript as JSON
        return json.dumps(transcript)  # Ensure valid JSON output
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python transcribe.py <YouTubeVideoID>"}))
        sys.exit(1)

    youtube_id = sys.argv[1]
    transcript = get_transcript(youtube_id)
    if transcript:
        print(transcript)
    else:
        print(json.dumps({"error": "Failed to fetch transcript."}))

    
# import re
# import spacy

# # Load the spaCy model
# nlp = spacy.load("en_core_web_sm")

# transcript = """
# Welcome to today's session on building confidence. First, you should always start by challenging negative thoughts. For example, when you think "I'm not good enough," try to counter it by recalling times you succeeded. 
# Now, let's move to the next step: daily affirmations. To improve your mindset, spend a few minutes every morning affirming your strengths. 
# Another important step is body language; confident body language can influence your mindset. Keep an open posture, maintain eye contact, and smile.
# Lastly, visualize success before any major event. This will help reduce anxiety and prepare you for positive outcomes.
# """

# # Define keywords for key phrase detection
# action_keywords = [
#     r"\byou should\b",
#     r"\bto improve\b",
#     r"\ban important step\b",
#     r"\byou need to\b",
#     r"\bit's crucial to\b",
#     r"\bstart by\b",
#     r"\bnext step\b",
#     r"\btry\b",
# ]

# # Function to segment transcript into sections by detecting topic shifts
# def segment_transcript(transcript):
#     # Process the transcript with spaCy
#     doc = nlp(transcript)
#     sections = []
#     section = []
#     prev_topic = None

#     for sent in doc.sents:
#         # Check for a topic shift based on keywords
#         if any(re.search(kw, sent.text, re.IGNORECASE) for kw in action_keywords):
#             if section:  # Save current section before starting a new one
#                 sections.append(" ".join(section))
#                 section = []
        
#         # Add sentence to current section
#         section.append(sent.text)
        
#     # Add the last section
#     if section:
#         sections.append(" ".join(section))
    
#     return sections

# # Function to detect key phrases related to actions, goals, and advice
# def detect_key_phrases(section):
#     key_phrases = []
#     for keyword in action_keywords:
#         matches = re.findall(keyword, section, re.IGNORECASE)
#         if matches:
#             key_phrases.extend(matches)
#     return key_phrases
# # Segment transcript and detect key phrases in each section

# segmented_transcript = segment_transcript(transcript)
# for idx, section in enumerate(segmented_transcript, 1):
#     print(f"\n--- Section {idx} ---\n{section}")
    
#     # Detect key phrases in this section
#     key_phrases = detect_key_phrases(section)
#     if key_phrases:
#         print("\nKey Phrases Detected:", key_phrases)



