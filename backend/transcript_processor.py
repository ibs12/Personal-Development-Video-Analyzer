import google.generativeai as genai
from typing import List, Dict, Any
from dataclasses import dataclass
import json
import re
import os

from rich import _console

@dataclass
class ActionItem:
    action: str
    explanation: str = ""
    timestamp: str = ""

@dataclass
class KeyInsight:
    keyInsight: str
    timestamp: str = ""

@dataclass
class Analogy:
    analogy: str
    timestamp: str = ""

@dataclass
class ProcessedContent:
    action_steps: List[ActionItem]
    key_insights: List[KeyInsight]
    analogies: List[Analogy]
    summary: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": self.summary,
            "action_steps": [
                {
                    "action": step.action,
                    "explanation": step.explanation,
                    "timestamp": step.timestamp
                }
                for step in self.action_steps
            ],
            "key_insights": [
                {
                    "keyInsight": insight.keyInsight,
                    "timestamp": insight.timestamp
                }
                for insight in self.key_insights
            ],
            "analogies": [
                {
                    "analogy": analogy.analogy,
                    "timestamp": analogy.timestamp
                }
                for analogy in self.analogies
            ]
        }

class PersonalDevelopmentProcessor:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-pro')
    
    def _format_transcript(self, transcript: List[Dict[str, Any]]) -> str:
        """Formats the transcript list into a readable text format."""
        formatted_text = "\n".join(
            f"[{item['start']}] {item['text']}" for item in transcript
        )
        return formatted_text

    def _create_summary_prompt(self, transcript: str) -> str:
        return f"""
        You are an expert in personal development content analysis. Review this transcript and provide:
        1. A concise summary focused on actionable insights
        2. The main message and key takeaways
        
        Transcript:
        {transcript}
        """

    def _create_action_prompt(self, transcript: str) -> str:
        return f"""
        Analyze this personal development content and provide a response in the exact JSON format shown below. Do not include any additional text, markdown, or explanations outside the JSON structure.

        Required JSON format:
        {{
            "action_steps": [
                {{
                    "action": "Specific action to take",
                    "explanation": "Brief explanation of how to implement this action",
                    "timestamp": "Timestamp in the video using the transcript to locate the action"
                }}
            ],
            "key_insights": [
                {{  "keyInsight": "Key Insight 1", 
                    "timestamp": "Timestamp in the video using the transcript to locate the key insight"
                }},
                {{  "keyInsight": "Key Insight 2", 
                    "timestamp": "Timestamp in the video using the transcript to locate the key insight"
                }}
            ],
            "analogies": [
                {{  "analogy": "Analogy 1", 
                    "timestamp": "Timestamp in the video using the transcript to locate the analogy"
                }},
                {{  "analogy": "Analogy 2", 
                    "timestamp": "Timestamp in the video using the transcript to locate the analogy"
                }}
            ]
        }}

        Make each action step concrete and immediately implementable. Focus on practical steps.
        
        Analyze this transcript:
        {transcript}

        Respond only with the JSON structure above.
        """

    def _extract_json_from_response(self, text: str) -> dict:
        """Extract JSON from the response text, handling potential formatting issues."""
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            try:
                json_match = re.search(r'\{.*\}', text, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())
                else:
                    raise ValueError("No JSON structure found in response")
            except Exception as e:
                print(f"Failed to extract JSON. Response text: {text}")
                raise ValueError(f"Could not parse response into JSON: {str(e)}")

    def process_transcript(self, transcript: List[Dict[str, Any]]) -> Dict[str, Any]:
        try:
            formatted_transcript = self._format_transcript(transcript)

            # Get summary
            summary_response = self.model.generate_content(self._create_summary_prompt(formatted_transcript))
            summary = summary_response.text

            # Get structured analysis
            action_response = self.model.generate_content(self._create_action_prompt(formatted_transcript))
            
            try:
                parsed_response = self._extract_json_from_response(action_response.text)
            except ValueError as e:
                print(f"JSON parsing error: {str(e)}")
                print(f"Raw response: {action_response.text}")
                return {
                    "status": "error",
                    "message": "Failed to parse AI response. Please try again."
                }

            action_steps = [
                ActionItem(
                    action=item.get('action', ''),
                    explanation=item.get('explanation', ''),
                    timestamp=item.get('timestamp', '')
                )
                for item in parsed_response.get('action_steps', [])
            ]

            key_insights = [
                KeyInsight(
                    keyInsight=item.get('keyInsight', ''),
                    timestamp=item.get('timestamp', '')
                )
                for item in parsed_response.get('key_insights', [])
            ]

            analogies = [
                Analogy(
                    analogy=item.get('analogy', ''),
                    timestamp=item.get('timestamp', '')
                )
                for item in parsed_response.get('analogies', [])
            ]

            processed_content = ProcessedContent(
                action_steps=action_steps,
                key_insights=key_insights,
                analogies=analogies,
                summary=summary
            )
            
            print(processed_content.to_dict())

            return {
                "status": "success",
                "data": processed_content.to_dict()
            }

        except Exception as e:
            print(f"Error processing transcript: {str(e)}")
            return {
                "status": "error",
                "message": f"Processing error: {str(e)}"
            }

if __name__ == "__main__":
    sample_transcript = [
        {'text': 'First, these six mindsets run counter', 'start': 73.3, 'duration': 3.64},
        {'text': 'to the best practices, as we call them, that are done in big companies today.', 'start': 76.98, 'duration': 5.04},
        # Additional transcript entries...
    ]
    processor = PersonalDevelopmentProcessor(api_key=os.getenv('API_KEY'))
    result = processor.process_transcript(sample_transcript)
    print(json.dumps(result, indent=2))
