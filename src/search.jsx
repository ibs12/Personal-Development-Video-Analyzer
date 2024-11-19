
import React, { useState } from 'react';
import { Loader2, YoutubeIcon, BrainCircuit, ListTodo, Lightbulb, Quote, FileText } from "lucide-react";
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Alert, AlertDescription } from "./components/ui/alert";
const ProcessingStep = ({ title, description, isActive, isComplete }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center
      ${isActive ? 'bg-blue-500 animate-pulse' : isComplete ? 'bg-green-500' : 'bg-gray-200'}`}>
      {isComplete ? (
        <div className="text-white">✓</div>
      ) : isActive ? (
        <Loader2 className="w-4 h-4 text-white animate-spin" />
      ) : (
        <div className="w-4 h-4" />
      )}
    </div>
    <div>
      <div className={`font-medium ${isActive ? 'text-blue-500' : isComplete ? 'text-green-500' : 'text-gray-500'}`}>
        {title}
      </div>
      <div className="text-sm text-gray-500">{description}</div>
    </div>
  </div>
);

const SearchBar = () => {
  const [youtubeURL, setYoutubeURL] = useState('');
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState(null);

  const processingSteps = [
    {
      title: "Fetching Video",
      description: "Retrieving video information from YouTube"
    },
    {
      title: "Generating Transcript",
      description: "Converting speech to text"
    },
    {
      title: "Processing Content",
      description: "Analyzing transcript with AI"
    },
    {
      title: "Generating Insights",
      description: "Creating action steps and key takeaways"
    }
  ];

// Update your handleSubmit function with these axios configurations:


const axiosConfig = {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  withCredentials: false  // Disable credentials
};

const handleSubmit = async (event) => {
  event.preventDefault();
  setLoading(true);
  setError('');
  setTranscript('');
  setAnalysisResult(null);

  try {
    // Step 1 & 2: Fetching Video & Generating Transcript
    setCurrentStep(0);
    setCurrentStep(1);
    const transcribeResponse = await axios.post(
      'http://127.0.0.1:5000/transcribe', 
      { YouTubeVideoURL: youtubeURL },
      
      axiosConfig
    );
    
    if (transcribeResponse.status !== 200) {
      throw new Error('Failed to fetch transcript.');
    }
    
    const transcriptText = transcribeResponse.data.transcript;
    setTranscript(transcriptText);
    
    // Step 3: Processing Content
    setCurrentStep(2);
    
    // Step 4: Generating Insights
    setCurrentStep(3);
    const processResponse = await axios.post(
      'http://127.0.0.1:5000/process-transcript', 
      { transcript: transcriptText }, 
      axiosConfig
    );
    
    if (processResponse.status !== 200) {
      throw new Error('Failed to process transcript.');
    }
    
    const analysisData = processResponse.data;
    
    if (analysisData.status === 'success') {
      const actionStepsArray = analysisData.data.action_steps.map(
        step => `${step.action}${step.explanation ? `: ${step.explanation}` : ''}`
      );

      setAnalysisResult({
        action_steps: actionStepsArray,
        key_insights: analysisData.data.key_insights || [],
        important_analogies: analysisData.data.analogies || [], 
        summary: analysisData.data.summary || ''
      });
    } else {
      throw new Error(analysisData.message || 'Failed to process transcript.');
    }

    setCurrentStep(4);
    
  } catch (error) {
    console.error('Error:', error);
    setError(error.message || 'An error occurred while processing your request.');
  } finally {
    setLoading(false);
  }
};

// Test endpoint to verify CORS
const testBackend = async () => {
  try {
    const response = await axios.get('http://localhost:5000/test', axiosConfig);
    console.log('Test response:', response.data);
  } catch (error) {
    console.error('Test error:', error);
  }
};

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <YoutubeIcon className="w-8 h-8 text-red-600" />
          <h1 className="text-2xl font-bold text-gray-900">YouTube Transcriber & Analyzer</h1>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Input and Processing */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Enter Video URL</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <input
                    className="w-full p-3 border border-gray-300 rounded-md bg-white"
                    placeholder="Paste YouTube URL here"
                    type="text"
                    value={youtubeURL}
                    onChange={(e) => setYoutubeURL(e.target.value)}
                  />
                  <button
                    className="w-full py-3 bg-blue-600 rounded-lg text-white font-medium 
                             hover:bg-blue-700 transition-colors disabled:opacity-50"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </span>
                    ) : (
                      'Analyze Video'
                    )}
                  </button>
                </form>

                {loading && (
                  <div className="mt-6">
                    {processingSteps.map((step, index) => (
                      <ProcessingStep
                        key={index}
                        {...step}
                        isActive={currentStep === index}
                        isComplete={currentStep > index}
                      />
                    ))}
                  </div>
                )}

                {error && (
                  <Alert className="mt-4" variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Middle Column - Transcript */}
          <div className="lg:col-span-1">
            {transcript && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Transcript
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[600px] overflow-y-auto">
                  <p className="text-gray-700 whitespace-pre-line">{transcript}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Analysis */}
          <div className="lg:col-span-1">
            {analysisResult && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5" />
                      AI Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-2">
                        <ListTodo className="w-4 h-4" />
                        Action Steps
                      </h3>
                      <ul className="list-disc list-inside space-y-2">
                        {analysisResult.action_steps.map((step, index) => (
                          <li key={index} className="text-gray-700">{step}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-2">
                        <Lightbulb className="w-4 h-4" />
                        Key Insights
                      </h3>
                      <ul className="list-disc list-inside space-y-2">
                        {analysisResult.key_insights.map((insight, index) => (
                          <li key={index} className="text-gray-700">{insight}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="flex items-center gap-2 font-semibold mb-2">
                        <Quote className="w-4 h-4" />
                        Important Analogies
                      </h3>
                      <ul className="list-disc list-inside space-y-2">
                        {analysisResult.important_analogies.map((analogy, index) => (
                          <li key={index} className="text-gray-700">{analogy}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchBar;