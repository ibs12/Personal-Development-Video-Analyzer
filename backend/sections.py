import re
import spacy
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from typing import List, Dict, Tuple, Set
import nltk
from nltk.tokenize import sent_tokenize
from collections import defaultdict

class EnhancedContentProcessor:
    def __init__(self):
        # Load required models
        self.nlp = spacy.load("en_core_web_sm")
        self.tokenizer = AutoTokenizer.from_pretrained("facebook/bart-large-cnn")
        self.model = AutoModelForSeq2SeqLM.from_pretrained("facebook/bart-large-cnn")
        
        # Define pattern categories for more nuanced analysis
        self.patterns = {
            'reasoning_patterns': [
                r"(?i)\b(because|therefore|thus|hence|since|as a result|consequently)\b",
                r"(?i)\b(this means|this suggests|this implies|which indicates)\b",
                r"(?i)\b(for example|such as|specifically|in particular|notably)\b"
            ],
            'insight_patterns': [
                r"(?i)\b(realize|understand|recognize|discover|learn|find that|see that)\b",
                r"(?i)\b(interesting|fascinating|surprising|remarkable|notable)\b",
                r"(?i)\b(in fact|actually|indeed|surprisingly|interestingly)\b"
            ],
            'action_patterns': [
                r"(?i)\b(need to|should|must|have to|important to|crucial to)\b",
                r"(?i)\b(try|implement|apply|use|develop|create|build|establish)\b",
                r"(?i)\b(start|begin|initiate|launch|kick off|get started)\b"
            ],
            'comparison_patterns': [
                r"(?i)\b(unlike|similar to|different from|compared to|in contrast)\b",
                r"(?i)\b(while|whereas|although|however|but|yet|instead)\b",
                r"(?i)\b(better|worse|more|less|greater|fewer|higher|lower)\b"
            ],
            'principle_patterns': [
                r"(?i)\b(principle|concept|theory|framework|approach|method)\b",
                r"(?i)\b(fundamental|basic|essential|core|key|critical)\b",
                r"(?i)\b(always|never|typically|generally|usually|often)\b"
            ]
        }

    def analyze_context(self, text: str) -> Dict[str, List[str]]:
        """Analyze the broader context and themes in the text"""
        doc = self.nlp(text)
        
        # Initialize containers for different types of analysis
        themes = defaultdict(list)
        
        # Analyze sentence relationships and contexts
        for sent in doc.sents:
            sent_text = sent.text.strip()
            
            # Categorize based on pattern matching
            for category, patterns in self.patterns.items():
                if any(re.search(pattern, sent_text) for pattern in patterns):
                    themes[category].append(sent_text)
            
            # Extract entities and their relationships
            entities = [(ent.text, ent.label_) for ent in sent.ents]
            if entities:
                themes['entity_relationships'].extend(entities)

        return dict(themes)

    def extract_key_concepts(self, text: str) -> List[Dict[str, str]]:
        """Extract and categorize key concepts from the text"""
        doc = self.nlp(text)
        concepts = []
        
        for sent in doc.sents:
            # Look for definitional or explanatory statements
            if any(marker in sent.text.lower() for marker in 
                  ["is", "means", "refers to", "defines", "represents"]):
                
                # Find the subject and its explanation
                for token in sent:
                    if token.dep_ in ["nsubj", "nsubjpass"]:
                        concept = {
                            "term": token.text,
                            "explanation": sent.text,
                            "type": "definition"
                        }
                        concepts.append(concept)
        
        return concepts

    def process_segment(self, segment: str) -> Dict:
        """Process individual segments with enhanced analysis"""
        # Generate initial summary
        inputs = self.tokenizer.encode(
            segment,
            max_length=1024,
            truncation=True,
            return_tensors="pt"
        )
        
        summary_ids = self.model.generate(
            inputs,
            max_length=200,
            min_length=50,
            length_penalty=2.0,
            num_beams=4,
            early_stopping=True
        )
        
        summary = self.tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        
        # Get context analysis
        context = self.analyze_context(segment)
        
        # Extract key concepts
        concepts = self.extract_key_concepts(segment)
        
        # Structure the results
        results = {
            "summary": summary,
            "key_concepts": concepts,
            "reasoning_patterns": context.get('reasoning_patterns', []),
            "insights": context.get('insight_patterns', []),
            "action_items": context.get('action_patterns', []),
            "comparisons": context.get('comparison_patterns', []),
            "principles": context.get('principle_patterns', []),
            "entity_relationships": context.get('entity_relationships', [])
        }
        
        return results

    def process_transcript(self, transcript_path: str) -> List[Dict]:
        """Process the entire transcript with enhanced segmentation and analysis"""
        with open(transcript_path, 'r') as file:
            transcript = file.read()
        
        # Improved segmentation based on topic shifts and semantic boundaries
        doc = self.nlp(transcript)
        segments = []
        current_segment = []
        current_topic = set()
        
        for sent in doc.sents:
            # Extract key entities and noun phrases from the sentence
            sent_topics = {token.text for token in sent if token.pos_ in ["NOUN", "PROPN"]}
            
            # Check for topic shift
            if current_segment and len(current_topic.intersection(sent_topics)) < 2:
                segments.append(" ".join(current_segment))
                current_segment = []
                current_topic = sent_topics
            
            current_segment.append(sent.text)
            current_topic.update(sent_topics)
        
        # Add the last segment
        if current_segment:
            segments.append(" ".join(current_segment))
        
        # Process each segment
        processed_segments = []
        for idx, segment in enumerate(segments, 1):
            results = self.process_segment(segment)
            results["section_number"] = idx
            results["original_text"] = segment
            processed_segments.append(results)
        
        return processed_segments

def format_output(results: List[Dict]) -> str:
    """Format the analysis results in a more readable and actionable way"""
    output = []
    
    for section in results:
        output.append(f"\n{'='*50}")
        output.append(f"Section {section['section_number']}:")
        output.append(f"{'='*50}\n")
        
        # Summary
        output.append("📝 Summary:")
        output.append(section['summary'])
        output.append("")
        
        # Key Concepts
        if section['key_concepts']:
            output.append("🔑 Key Concepts:")
            for concept in section['key_concepts']:
                output.append(f"• {concept['term']}: {concept['explanation']}")
            output.append("")
        
        # Main Points and Reasoning
        if section['reasoning_patterns']:
            output.append("💡 Main Points and Reasoning:")
            for point in section['reasoning_patterns']:
                output.append(f"• {point}")
            output.append("")
        
        # Insights and Observations
        if section['insights']:
            output.append("🎯 Key Insights:")
            for insight in section['insights']:
                output.append(f"• {insight}")
            output.append("")
        
        # Action Items
        if section['action_items']:
            output.append("⚡ Action Items:")
            for action in section['action_items']:
                output.append(f"• {action}")
            output.append("")
        
        # Principles and Frameworks
        if section['principles']:
            output.append("📚 Principles and Frameworks:")
            for principle in section['principles']:
                output.append(f"• {principle}")
            output.append("")
    
    return "\n".join(output)

def main():
    # Initialize the processor
    processor = EnhancedContentProcessor()
    
    # Process the transcript
    results = processor.process_transcript('transcript.txt')
    
    # Format and display results
    formatted_output = format_output(results)
    print(formatted_output)

if __name__ == "__main__":
    main() 