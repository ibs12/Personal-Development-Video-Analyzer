import google.generativeai as genai
from typing import List, Dict, Any
from dataclasses import dataclass
import json
import re
import os
@dataclass
class ActionItem:
    action: str
    explanation: str = ""

@dataclass
class ProcessedContent:
    action_steps: List[ActionItem]
    key_insights: List[str]
    analogies: List[str]
    summary: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": self.summary,
            "action_steps": [
                {
                    "action": step.action,
                    "explanation": step.explanation
                }
                for step in self.action_steps
            ],
            "key_insights": self.key_insights,
            "analogies": self.analogies
        }

class PersonalDevelopmentProcessor:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-pro')
    
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
                    "explanation": "Brief explanation of how to implement this action"
                }}
            ],
            "key_insights": [
                "Key insight 1",
                "Key insight 2"
            ],
            "analogies": [
                "Analogy 1",
                "Analogy 2"
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

    def process_transcript(self, transcript: str) -> Dict[str, Any]:
        try:
            # Get summary
            summary_response = self.model.generate_content(self._create_summary_prompt(transcript))
            summary = summary_response.text

            # Get structured analysis
            action_response = self.model.generate_content(self._create_action_prompt(transcript))
            
            try:
                parsed_response = self._extract_json_from_response(action_response.text)
            except ValueError as e:
                print(f"JSON parsing error: {str(e)}")
                print(f"Raw response: {action_response.text}")
                return {
                    "status": "error",
                    "message": "Failed to parse AI response. Please try again."
                }

            action_steps = []
            for action_data in parsed_response.get('action_steps', []):
                if isinstance(action_data, dict):
                    action_steps.append(ActionItem(
                        action=action_data.get('action', ''),
                        explanation=action_data.get('explanation', '')
                    ))

            processed_content = ProcessedContent(
                action_steps=action_steps,
                key_insights=parsed_response.get('key_insights', []),
                analogies=parsed_response.get('analogies', []),
                summary=summary
            )

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
    sample_transcript = "This is a test transcript..."
    processor = PersonalDevelopmentProcessor(api_key=os.getenv('API_KEY'))
    result = processor.process_transcript(sample_transcript)
    print(json.dumps(result, indent=2))