import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './search.css';
import { 
  BookmarkIcon, 
  PlayIcon, 
  LightbulbIcon, 
  ClockIcon,
  FileTextIcon,
  YoutubeIcon,
  Loader2,
  BrainCircuit,
  ListTodo,
  Quote,
  Search,
  MenuIcon,
  StarIcon
} from 'lucide-react';


const PersonalDevInsightsApp = () => {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [transcriptText, setTranscriptText] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [insights, setInsights] = useState(null);
  const [youtubePlayer, setYoutubePlayer] = useState(null);


  // Extract YouTube Video ID
  const extractVideoId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Handle Video Submission
  const handleVideoSubmission = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setTranscriptText('');
    setInsights(null);
  
    try {
      setIsLoading(true);
      const extractedVideoId = extractVideoId(videoUrl);
      if (!extractedVideoId) {
        throw new Error('Invalid YouTube URL');
      }
      setVideoId(extractedVideoId);
  
      const transcribeResponse = await axios.post(
        'http://127.0.0.1:5000/transcribe',
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
      
      const processResponse = await axios.post(
        'http://127.0.0.1:5000/process-transcript',
        { transcript: transcriptData },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: true
        }
      );
    
      if (processResponse.status !== 200) {
        throw new Error('Failed to process transcript.');
      }
    
      const analysisData = processResponse.data;
    
      if (analysisData.status === 'success') {
        setInsights({
          actionSteps: analysisData.data.action_steps.map((step) => ({
            action: step.action,
            explanation: step.explanation,
            timestamp: step.timestamp,
          })),
          keyInsights: analysisData.data.key_insights || [],
          importantExamples: analysisData.data.examples || [],
          summary: analysisData.data.summary || '',
        });
      } else {
        throw new Error(analysisData.message || 'Failed to process transcript.');
      }
    } catch (error) {
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      setError(error.message || 'An error occurred while processing your request.');
    } finally {
      setLoading(false);
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
 
  const handleTranscriptClick = (time) => {
    if (youtubePlayer) {
      youtubePlayer.seekTo(time, true);
      youtubePlayer.playVideo();
    }
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
          <div className="flex-grow flex justify-center space-x-4">
            <form 
              onSubmit={handleVideoSubmission} 
              className="relative w-[450px] mx-auto" // Significantly wider
            >
              <div className="flex items-center bg-white rounded-full pr-4"> {/* Slightly more padding */}
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
          <div className="flex items-center bg-white shadow-md py-4 px-6 space-x-4 text-gray-700 rounded-lg">
            {/* Action Steps */}
            <div className="group relative cursor-pointer">
              <div className="flex items-center h-12 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-300 w-12 group-hover:w-[160px] pl-3 overflow-hidden">
                <BookmarkIcon className="w-6 h-6 text-white shrink-0 mr-2" style={{ height: '100%', display: 'flex', alignItems: 'center'}} />
                <span className="opacity-0 text-white whitespace-nowrap transition-opacity duration-300 group-hover:opacity-100">
                  Action Steps
                </span>
              </div>
            </div>


            {/* Key Insights */}
            <div className="group relative cursor-pointer">
              <div className="flex items-center h-12 bg-gradient-to-r from-purple-400 to-purple-500 rounded-full transition-all duration-300 w-12 group-hover:w-[160px] pl-3 overflow-hidden">
                <LightbulbIcon className="w-6 h-6 text-white shrink-0 mr-2" style={{ height: '100%', display: 'flex', alignItems: 'center'}} />
                <span className="opacity-0 text-white whitespace-nowrap transition-opacity duration-300 group-hover:opacity-100">
                  Key Insights
                </span>
              </div>
            </div>

            {/* Important Examples */}
            <div className="group relative cursor-pointer">
              <div className="flex items-center h-12 bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-300 w-12 group-hover:w-[160px] pl-3 overflow-hidden">
                <StarIcon className="w-6 h-6 text-white shrink-0 mr-2" style={{ height: '100%', display: 'flex', alignItems: 'center'}} />
                <span className="opacity-0 text-white whitespace-nowrap transition-opacity duration-300 group-hover:opacity-100">
                  Examples
                </span>
              </div>
            </div>

            {/* Summary */}
            <div className="group relative cursor-pointer">
              <div className="flex items-center h-12 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full transition-all duration-300 w-12 group-hover:w-[160px] pl-3 overflow-hidden">
                <MenuIcon className="w-6 h-6 text-white shrink-0 mr-2" style={{ height: '100%', display: 'flex', alignItems: 'center'}} />
                <span className="opacity-0 text-white whitespace-nowrap transition-opacity duration-300 group-hover:opacity-100">
                  Summary
                </span>
              </div>
            </div>
          </div>



          </div>
        {error && (
          <div className="text-red-500 mt-2 flex justify-center">
            {error}
          </div>
        )}
      </section>

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


        {/* <div className="h-screen overflow-y-scroll"> */}
          {/* Insights Sections */}
          <div className="md:col-span-1 space-y-6 h-[90vh] overflow-y-scroll">
            {/* Action Steps Section */}
            <section className="bg-gradient-to-r from-[#87CEEB] to-[#B0C4DE] p-5 rounded-lg">
              <h2 className="flex items-center text-xl font-semibold text-blue-700 mb-4">
                <BookmarkIcon className="mr-2" /> Action Steps
              </h2>
              {insights.actionSteps.map((step, index) => (
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
                      {/* {Math.floor((step.timestamp) / 60)}.{Math.round(step.timestamp % 60)} */}
                      {new Date(step.timestamp * 1000).toISOString().substr(14, 5)}

                    </button>
                  )}
                </div>
              ))}
            </section>
            
            {/* Key Insights Section */}
            <section className="bg-gradient-to-r from-[#dc8efe] to-[#faf5ff] p-5 rounded-lg">
              <h2 className="flex items-center text-xl font-semibold text-purple-700 mb-4">
                <LightbulbIcon className="mr-2" /> Key Insights
              </h2>
              <ul className="list-disc ml-5 text-gray-700">
                {insights.keyInsights.map((insight, index) => (
                  <div key={index} className="mb-4 p-4 bg-white rounded-lg shadow-sm flex justify-between items-center">
                    {/* <li key={index}>{insight.keyInsight || insight}</li> */}
                    <div>
                      <h3 className="font-bold  text-purple-700 mb-2 mr-5">{insight.keyInsight}</h3>
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
            
            {/* Important Examples Section */}
            <section className="bg-gradient-to-r from-[#97e8af] to-[#f0fdf4] p-5 rounded-lg">
              <h2 className="flex items-center text-xl font-semibold text-green-700 mb-4">
                <Quote className="mr-2" /> Important Examples
              </h2>
              <ul className="list-disc ml-5 text-gray-700">
                {insights.importantExamples.map((example, index) => (
                  <div key={index} className = "mb-4 p-4 bg-white rounded-lg shadow-sm flex justify-between items-center">
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
            
            {/* Summary Section */}
            <section className="bg-gray-50 p-5 rounded-lg">
              <h2 className="flex items-center text-xl font-semibold text-gray-700 mb-4">
                <FileTextIcon className="mr-2" /> Summary
              </h2>
              <p className="text-gray-600">{insights.summary}</p>
            </section>
          </div>
        {/* </div> */}
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