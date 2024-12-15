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
class Example:
    example: str
    timestamp: str = ""

@dataclass
class ProcessedContent:
    action_steps: List[ActionItem]
    key_insights: List[KeyInsight]
    examples: List[Example]
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
            "examples": [
                {
                    "example": example.example,
                    "timestamp": example.timestamp
                }
                for example in self.examples
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
        1. The main message and key takeaways
                
        Transcript:
        {transcript}
        """
        

    def _create_action_prompt(self, transcript: str) -> str:
        return f"""
    Analyze the following personal development content and extract the required information in the exact JSON format shown below. Ensure that:
    - Responses adhere strictly to the JSON structure.
    - No additional text, markdown, or explanations are included outside the JSON structure.
    - Each action step is concrete, practical, and immediately implementable.

    Required JSON format:
    {{
        "action_steps": [
            {{
                "action": "Specific action to take or not to take",
                "explanation": "Brief explanation of how to implement this action or why not to take a certain action",
                "timestamp": "Timestamp in the video using the transcript to locate the action"
            }}
        ],
        "key_insights": [
            {{
                "keyInsight": "A significant insight that is not an action but a key point to remember",
                "timestamp": "Timestamp in the video using the transcript to locate the key insight"
            }}
        ],
        "examples": [
            {{
                "example": "An example illustrating a concept or action mentioned in the content",
                "timestamp": "Timestamp in the video using the transcript to locate the example"
            }}
        ]
    }}

    Example response:
    {{
        "action_steps": [
            {{
                "action": "Start practicing mindfulness for 5 minutes daily",
                "explanation": "Helps improve focus and reduce stress. Start by setting aside 5 minutes each morning.",
                "timestamp": "2548.546"
            }}
        ],
        "key_insights": [
            {{
                "keyInsight": "Mindfulness can rewire your brain for better focus and emotional regulation",
                "timestamp": "1548.687"
            }}
        ],
        "examples": [
            {{
                "example": "Try a simple breathing exercise, inhaling for 4 seconds and exhaling for 4 seconds",
                "timestamp": "436.7576"
            }}
        ]
    }}

    Now, analyze this transcript and provide your response in the required JSON format:
    {transcript}
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

            examples = [
                Example(
                    example=item.get('example', ''),
                    timestamp=item.get('timestamp', '')
                )
                for item in parsed_response.get('examples', [])
            ]

            processed_content = ProcessedContent(
                action_steps=action_steps,
                key_insights=key_insights,
                examples=examples,
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
