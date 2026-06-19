import React, { useState } from 'react';
import axios from 'axios';
import './search.css';
import {
  BookmarkIcon,
  LightbulbIcon,
  FileTextIcon,
  Quote,
  Search,
  MenuIcon,
  Loader2,
  BrainCircuit
} from 'lucide-react';

// Base URL of the Flask backend. Override per-environment with
// REACT_APP_API_BASE_URL (e.g. in a .env file or your deploy config).
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:5000';

// Models / thinking levels the user can choose (must match the backend allowlist).
const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 · balanced' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8 · best quality' },
];
const EFFORTS = [
  { value: 'low', label: 'Low · fastest' },
  { value: 'medium', label: 'Medium · balanced' },
  { value: 'high', label: 'High · most thorough' },
];


const PersonalDevInsightsApp = () => {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [insights, setInsights] = useState(null);
  const [model, setModel] = useState(MODELS[0].value);
  const [effort, setEffort] = useState('medium');
  const [reasoning, setReasoning] = useState('');   // live thinking text
  const [stage, setStage] = useState('');           // current pipeline stage label


  // Extract YouTube Video ID
  const extractVideoId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Handle Video Submission
  const handleVideoSubmission = async (event) => {
    event.preventDefault();
    setError('');
    setInsights(null);
    setReasoning('');
    setStage('');

    try {
      setIsLoading(true);
      const extractedVideoId = extractVideoId(videoUrl);
      if (!extractedVideoId) {
        throw new Error('Invalid YouTube URL');
      }
      setVideoId(extractedVideoId);

      setStage('Fetching transcript…');
      const transcribeResponse = await axios.post(
        `${API_BASE_URL}/transcribe`,
        { YouTubeVideoID: extractedVideoId }
      );
      
      if (transcribeResponse.status !== 200) {
        throw new Error('Failed to fetch transcript.');
      }
      
      console.log("Response data:", transcribeResponse.data);
      
      // Assuming the structured_transcript is within the response data
      const transcriptData = transcribeResponse.data.structured_transcript.map(item => ({
        text: item.text,
        start: item.start,
        duration: item.duration
      }));

      setTranscript(transcriptData);
      
      console.log("Mapped Transcript Data:", transcriptData);
      
      // Stream the analysis (Server-Sent Events) so we can show Claude's
      // reasoning live instead of staring at empty space.
      const processResponse = await fetch(`${API_BASE_URL}/process-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptData, model, effort }),
      });

      if (!processResponse.ok || !processResponse.body) {
        throw new Error('Failed to process transcript.');
      }

      const reader = processResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gotResult = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep).trim();
          buffer = buffer.slice(sep + 2);
          if (!frame.startsWith('data:')) continue;

          const ev = JSON.parse(frame.slice(5).trim());
          if (ev.type === 'status') {
            setStage(ev.label);
          } else if (ev.type === 'thinking') {
            setReasoning((prev) => prev + ev.text);
          } else if (ev.type === 'result') {
            gotResult = true;
            const d = ev.data;
            setInsights({
              actionSteps: (d.action_steps || []).map((step) => ({
                action: step.action,
                explanation: step.explanation,
                timestamp: step.timestamp,
              })),
              keyInsights: d.key_insights || [],
              importantExamples: d.examples || [],
              summary: d.summary || '',
            });
          } else if (ev.type === 'error') {
            throw new Error(ev.message || 'Failed to process transcript.');
          }
        }
      }

      if (!gotResult) {
        throw new Error('The model did not return any analysis.');
      }
    } catch (error) {
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      setError(error.message || 'An error occurred while processing your request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimestampClick = (timestamp) => {
    // Convert timestamp to integer seconds
    const startTime = Math.floor(parseFloat(timestamp));
  
    // Get the current iframe
    const iframe = document.querySelector('iframe');
    
    if (iframe) {
      // Modify the src to include the start time and autoplay
      iframe.src = `https://www.youtube.com/embed/${videoId}?start=${startTime}&autoplay=1`;
    }
  };

  const defaultData = {
    actionSteps: [],
    keyInsights: [],
    importantExamples: [],
    summary: ''
  };

  const data = insights || defaultData;

  // State to track section order
  const [sectionOrder, setSectionOrder] = useState(['action', 'insights', 'examples', 'summary']);

  const moveToTop = (sectionId) => {
    setSectionOrder(prev => {
        const newOrder = prev.filter(id => id !== sectionId);
        return [sectionId, ...newOrder];
    });

    const section = document.getElementById("output");

    section.scrollTo({
        top: 0,
        behavior: 'smooth', 
    });
};

  // Component for each section
  const sections = {
    action: (
      data.actionSteps && data.actionSteps.length > 0 ? (
        <section className="bg-gradient-to-r from-[#87CEEB] to-[#B0C4DE] p-5 rounded-lg">
          <h2 className="flex items-center text-xl font-semibold text-blue-700 mb-4">
            <BookmarkIcon className="mr-2" /> Action Steps
          </h2>
          {data.actionSteps.map((step, index) => (
            <div key={index} className="mb-4 p-4 bg-white rounded-lg shadow-sm flex justify-between items-center">
              <div>
                <h3 className="font-bold text-blue-600 mb-2">{step.action}</h3>
                {step.explanation && <p className="text-gray-600">{step.explanation}</p>}
              </div>
              {step.timestamp && (
                <button
                  onClick={() => handleTimestampClick(step.timestamp)}
                  className="bg-white text-blue-500 px-3 py-1 rounded hover:bg-white-600 text-lg font-semibold"
                >
                  {new Date(step.timestamp * 1000).toISOString().substr(14, 5)}
                </button>
              )}
            </div>
          ))}
        </section>
      ) : (
        <section className="bg-gradient-to-r from-[#87CEEB] to-[#B0C4DE] p-5 rounded-lg">
          <h2 className="flex items-center text-xl font-semibold text-blue-700 mb-4">
            <BookmarkIcon className="mr-2" /> Action Steps
          </h2>
          <p className="text-gray-700">No action steps found for this video.</p>
        </section>
      )
    ),
  
    insights: (
      data.keyInsights && data.keyInsights.length > 0 ? (
        <section className="bg-gradient-to-r from-[#dc8efe] to-[#faf5ff] p-5 rounded-lg">
          <h2 className="flex items-center text-xl font-semibold text-purple-700 mb-4">
            <LightbulbIcon className="mr-2" /> Key Insights
          </h2>
          <ul className="list-disc ml-5 text-gray-700">
            {data.keyInsights.map((insight, index) => (
              <div key={index} className="mb-4 p-4 bg-white rounded-lg shadow-sm flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-purple-700 mb-2 mr-5">{insight.keyInsight}</h3>
                </div>
                {insight.timestamp && (
                  <button
                    onClick={() => handleTimestampClick(insight.timestamp)}
                    className="bg-white text-blue-500 px-3 py-1 rounded hover:bg-white-600 text-lg font-semibold"
                  >
                    {new Date(insight.timestamp * 1000).toISOString().substr(14, 5)}
                  </button>
                )}
              </div>
            ))}
          </ul>
        </section>
      ) : (
        <section className="bg-gradient-to-r from-[#dc8efe] to-[#faf5ff] p-5 rounded-lg">
          <h2 className="flex items-center text-xl font-semibold text-purple-700 mb-4">
            <LightbulbIcon className="mr-2" /> Key Insights
          </h2>
          <p className="text-gray-700">No insights found for this video.</p>
        </section>
      )
    ),
  
    examples: (
      data.importantExamples && data.importantExamples.length > 0 ? (
        <section className="bg-gradient-to-r from-[#97e8af] to-[#f0fdf4] p-5 rounded-lg">
          <h2 className="flex items-center text-xl font-semibold text-green-700 mb-4">
            <Quote className="mr-2" /> Important Examples
          </h2>
          <ul className="list-disc ml-5 text-gray-700">
            {data.importantExamples.map((example, index) => (
              <div key={index} className="mb-4 p-4 bg-white rounded-lg shadow-sm flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-green-700 mb-2">{example.example}</h3>
                </div>
                {example.timestamp && (
                  <button
                    onClick={() => handleTimestampClick(example.timestamp)}
                    className="bg-white text-blue-500 px-3 py-1 rounded hover:bg-white-600 text-lg font-semibold"
                  >
                    {new Date(example.timestamp * 1000).toISOString().substr(14, 5)}
                  </button>
                )}
              </div>
            ))}
          </ul>
        </section>
      ) : (
        <section className="bg-gradient-to-r from-[#97e8af] to-[#f0fdf4] p-5 rounded-lg">
          <h2 className="flex items-center text-xl font-semibold text-green-700 mb-4">
            <Quote className="mr-2" /> Important Examples
          </h2>
          <p className="text-gray-700">No examples found for this video.</p>
        </section>
      )
    ),
  
    summary: (
      data.summary ? (
        <section className="bg-gray-50 p-5 rounded-lg">
          <h2 className="flex items-center text-xl font-semibold text-gray-700 mb-4">
            <MenuIcon className="mr-2" /> Summary
          </h2>
          <p className="text-gray-600">{data.summary}</p>
        </section>
      ) : (
        <section className="bg-gray-50 p-5 rounded-lg">
          <h2 className="flex items-center text-xl font-semibold text-gray-700 mb-4">
            <MenuIcon className="mr-2" /> Summary
          </h2>
          <p className="text-gray-700">No summary available for this video.</p>
        </section>
      )
    )
  };

  
  // max-w-6xl mx-auto p-6 bg-white shadow-lg rounded-xl
  return (
    <div className="h-screen p-5 bg-inherit overflow-y-scroll">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-neutral-800 mb-4">
          Personal Development Insights Extractor
        </h1>
      </header>

      <section className="mb-6">
        <div className="flex items-center w-full h-16">
          <div className="flex-grow flex justify-center space-x-4 pl-[18vw]"> 
            <form 
              onSubmit={handleVideoSubmission} 
              className="relative w-[450px] mx-auto" 
            >
              <div className="flex items-center bg-white rounded-full pr-4"> 
                <div className="absolute left-5 top-1/2 transform -translate-y-1/2">
                  <Search 
                    className="text-neutral-800 cursor-pointer" 
                    onClick={handleVideoSubmission}
                    size={32} 
                  />
                </div>
                <input 
                  type="text" 
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Paste YouTube video URL"
                  className="w-full pl-16 pr-6 py-5 text-3xl bg-transparent text-neutral-800 placeholder-neutral-400 focus:outline-none" 
                  // Increased padding, text size, and left padding for icon
                />
              </div>
            </form>
          </div>
          {/* Navigation Buttons */}
          <div className="flex items-center bg-white shadow-md py-4 px-6 space-x-4 text-gray-700 rounded-lg">
            {/* Action Steps */}
            <div className="group relative cursor-pointer" onClick={() => moveToTop('action')}>
              <div className="flex items-center h-12 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-300 w-12 group-hover:w-[160px] pl-3 overflow-hidden">
                <BookmarkIcon className="w-6 h-6 text-white shrink-0 mr-2" style={{ height: '100%', display: 'flex', alignItems: 'center'}} />
                <span className="opacity-0 text-white whitespace-nowrap transition-opacity duration-300 group-hover:opacity-100">
                  Action Steps
                </span>
              </div>
            </div>

            {/* Key Insights */}
            <div className="group relative cursor-pointer" onClick={() => moveToTop('insights')}>
              <div className="flex items-center h-12 bg-gradient-to-r from-purple-400 to-purple-500 rounded-full transition-all duration-300 w-12 group-hover:w-[160px] pl-3 overflow-hidden">
                <LightbulbIcon className="w-6 h-6 text-white shrink-0 mr-2" style={{ height: '100%', display: 'flex', alignItems: 'center'}} />
                <span className="opacity-0 text-white whitespace-nowrap transition-opacity duration-300 group-hover:opacity-100">
                  Key Insights
                </span>
              </div>
            </div>

            {/* Important Examples */}
            <div className="group relative cursor-pointer" onClick={() => moveToTop('examples')}>
              <div className="flex items-center h-12 bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-300 w-12 group-hover:w-[160px] pl-3 overflow-hidden">
                <Quote className="w-6 h-6 text-white shrink-0 mr-2" style={{ height: '100%', display: 'flex', alignItems: 'center'}} />
                <span className="opacity-0 text-white whitespace-nowrap transition-opacity duration-300 group-hover:opacity-100">
                  Examples
                </span>
              </div>
            </div>

            {/* Summary */}
            <div className="group relative cursor-pointer" onClick={() => moveToTop('summary')}>
              <div className="flex items-center h-12 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full transition-all duration-300 w-12 group-hover:w-[160px] pl-3 overflow-hidden">
                <MenuIcon className="w-6 h-6 text-white shrink-0 mr-2" style={{ height: '100%', display: 'flex', alignItems: 'center'}} />
                <span className="opacity-0 text-white whitespace-nowrap transition-opacity duration-300 group-hover:opacity-100">
                  Summary
                </span>
              </div>
            </div>
          </div>
      </div>

        {/* Model + thinking-level controls */}
        <div className="flex items-center justify-center gap-4 mt-4 text-sm text-neutral-700">
          <label className="flex items-center gap-2">
            <span className="font-medium">Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isLoading}
              className="bg-white rounded-md px-3 py-1.5 shadow-sm focus:outline-none disabled:opacity-60"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="font-medium">Thinking</span>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value)}
              disabled={isLoading}
              className="bg-white rounded-md px-3 py-1.5 shadow-sm focus:outline-none disabled:opacity-60"
            >
              {EFFORTS.map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="text-red-500 mt-2 flex justify-center">
            {error}
          </div>
        )}
      </section>

      {/* Live reasoning — shows Claude's thinking while it works, instead of blank space */}
      {isLoading && (
        <div className="max-w-3xl mx-auto mb-8">
          <div className="bg-white/90 rounded-xl shadow-md p-5">
            <div className="flex items-center text-sm font-semibold text-neutral-700 mb-3">
              <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-500" />
              {stage || 'Working…'}
            </div>
            {reasoning ? (
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-600 max-h-72 overflow-y-auto font-mono">
                {reasoning}
              </pre>
            ) : (
              <p className="text-xs text-neutral-400">Claude is thinking…</p>
            )}
          </div>
        </div>
      )}

      {/* Collapsible reasoning once results are in */}
      {!isLoading && insights && reasoning && (
        <details className="max-w-3xl mx-auto mb-6">
          <summary className="cursor-pointer text-sm font-medium text-neutral-600 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4" /> View model reasoning
          </summary>
          <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-500 mt-2 max-h-72 overflow-y-auto font-mono bg-white/80 rounded-lg p-4">
            {reasoning}
          </pre>
        </details>
      )}

      {videoId && insights && (
        <div className="child grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
          {/* Video Player Column */}
          <div className="md:col-span-1">
            <div className="relative pb-[56.25%] h-0 overflow-hidden">
              <iframe
                key={videoId}  // Force re-render on new video
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full rounded-3xl"
                onLoad={() => {
                  console.log('Video iframe loaded');
                  setIsLoading(false);
                }}
              />
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  Loading video...
                </div>
              )}
            </div>
            {/* Transcript Column */}
              <div className="bg-gray-50 p-4 mt-5 rounded-lg">
                <h2 className="flex items-center text-xl font-semibold text-gray-700 mb-4">
                  <FileTextIcon className="mr-2" /> Transcript
                </h2>
                <div className="h-96 overflow-y-auto">
                  {transcript.map((entry, idx) => (
                    <div
                      key={idx}
                      className="text-lg text-gray-600 hover:bg-gray-200 p-2 cursor-pointer"
                      onClick={() => handleTimestampClick((entry.start))}
                    >
                      <span className="text-md text-blue-500">
                        {new Date(entry.start * 1000).toISOString().substr(14, 5)}
                      </span>
                      {' - '}
                      {entry.text}
                    </div>
                  ))}
                </div>
              </div>
          </div>

          {/* Sections */}
          <div id = "output" className="md:col-span-1 space-y-6 h-[90vh] overflow-y-scroll">
            {sectionOrder.map(sectionId => sections[sectionId])}
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalDevInsightsApp;



// import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
// import { Alert, AlertDescription } from "./components/ui/alert";

// // Processing Step Component
// const ProcessingStep = ({ title, description, isActive, isComplete }) => (
//   <div className="flex items-center gap-3 mb-4">
//     <div className={`w-8 h-8 rounded-full flex items-center justify-center
//       ${isActive ? 'bg-blue-500 animate-pulse' : isComplete ? 'bg-green-500' : 'bg-gray-200'}`}>
//       {isComplete ? (
//         <div className="text-white">✓</div>
//       ) : isActive ? (
//         <Loader2 className="w-4 h-4 text-white animate-spin" />
//       ) : (
//         <div className="w-4 h-4" />
//       )}
//     </div>
//     <div>
//       <div className={`font-medium ${isActive ? 'text-blue-500' : isComplete ? 'text-green-500' : 'text-gray-500'}`}>
//         {title}
//       </div>
//       <div className="text-sm text-gray-500">{description}</div>
//     </div>
//   </div>
// );



  // // Processing steps for loading state
  // const processingSteps = [
  //   {
  //     title: "Fetching Video",
  //     description: "Retrieving video information from YouTube"
  //   },
  //   {
  //     title: "Generating Transcript",
  //     description: "Converting speech to text"
  //   },
  //   {
  //     title: "Processing Content",
  //     description: "Analyzing transcript with AI"
  //   },
  //   {
  //     title: "Generating Insights",
  //     description: "Creating action steps and key takeaways"
  //   }
  // ];

  // // YouTube Player Initialization
  // // useEffect(() => {
  // //   // Load YouTube iframe API if not already loaded
  // //   if (!window.YT) {
  // //     const tag = document.createElement('script');
  // //     tag.src = "https://www.youtube.com/iframe_api";
  // //     const firstScriptTag = document.getElementsByTagName('script')[0];
  // //     firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  
  // //     window.onYouTubeIframeAPIReady = () => {
  // //       // Only create player if videoId is valid
  // //       if (videoId && videoId.length === 11) {
  // //         createPlayer();
  // //       }
  // //     };
  // //   } else if (videoId && videoId.length === 11) {
  // //     createPlayer();
  // //   }
  // // }, [videoId]);

  // // Create YouTube Player
  // const createPlayer = () => {
  //   if (window.YT && videoId) {
  //     try {
  //       const player = new window.YT.Player('youtube-player', {
  //         height: '390',
  //         width: '640',
  //         videoId: videoId,
  //         playerVars: {
  //           'playsinline': 1
  //         },
  //         events: {
  //           'onReady': (event) => {
  //             console.log('YouTube Player is ready');
  //             setYoutubePlayer(event.target);
  //           },
  //           'onError': (error) => {
  //             console.error('YouTube Player Error:', error);
  //           }
  //         }
  //       });
  //     } catch (error) {
  //       console.error('Error creating YouTube Player:', error);
  //     }
  //   }
  // };