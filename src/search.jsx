import React, { useState } from 'react';
import axios from 'axios';
import './search.css';
import {
  Search,
  Loader2,
  BrainCircuit,
  BookmarkIcon,
  LightbulbIcon,
  Quote,
  AlignLeft,
  FileTextIcon,
  Clock,
  X,
  Sparkles,
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

const TABS = [
  { id: 'action', label: 'Action Steps', icon: BookmarkIcon },
  { id: 'insights', label: 'Key Insights', icon: LightbulbIcon },
  { id: 'examples', label: 'Examples', icon: Quote },
  { id: 'summary', label: 'Summary', icon: AlignLeft },
];

const formatTime = (t) => {
  const total = Math.floor(parseFloat(t) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
};

const PersonalDevInsightsApp = () => {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [insights, setInsights] = useState(null);
  const [model, setModel] = useState(MODELS[0].value);
  const [effort, setEffort] = useState('medium');
  const [reasoning, setReasoning] = useState(''); // live thinking text
  const [stage, setStage] = useState(''); // current pipeline stage label
  const [activeTab, setActiveTab] = useState('action');

  const extractVideoId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const handleVideoSubmission = async (event) => {
    if (event) event.preventDefault();
    if (isLoading) return;
    setError('');
    setInsights(null);
    setReasoning('');
    setStage('');

    try {
      setIsLoading(true);
      const extractedVideoId = extractVideoId(videoUrl);
      if (!extractedVideoId) {
        throw new Error('That doesn’t look like a valid YouTube URL.');
      }
      setVideoId(extractedVideoId);

      setStage('Fetching transcript…');
      const transcribeResponse = await axios.post(`${API_BASE_URL}/transcribe`, {
        YouTubeVideoID: extractedVideoId,
      });
      if (transcribeResponse.status !== 200) {
        throw new Error('Failed to fetch transcript.');
      }

      const transcriptData = transcribeResponse.data.structured_transcript.map((item) => ({
        text: item.text,
        start: item.start,
        duration: item.duration,
      }));
      setTranscript(transcriptData);

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
            const next = {
              actionSteps: (d.action_steps || []).map((step) => ({
                action: step.action,
                explanation: step.explanation,
                timestamp: step.timestamp,
              })),
              keyInsights: d.key_insights || [],
              importantExamples: d.examples || [],
              summary: d.summary || '',
            };
            setInsights(next);
            setActiveTab(
              next.actionSteps.length ? 'action'
              : next.keyInsights.length ? 'insights'
              : next.importantExamples.length ? 'examples'
              : 'summary'
            );
          } else if (ev.type === 'error') {
            throw new Error(ev.message || 'Failed to process transcript.');
          }
        }
      }

      if (!gotResult) {
        throw new Error('The model did not return any analysis.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while processing your request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimestampClick = (timestamp) => {
    const startTime = Math.floor(parseFloat(timestamp));
    const iframe = document.querySelector('iframe');
    if (iframe) {
      iframe.src = `https://www.youtube.com/embed/${videoId}?start=${startTime}&autoplay=1`;
    }
  };

  const data = insights || { actionSteps: [], keyInsights: [], importantExamples: [], summary: '' };
  const counts = {
    action: data.actionSteps.length,
    insights: data.keyInsights.length,
    examples: data.importantExamples.length,
    summary: data.summary ? 1 : 0,
  };

  const TimestampChip = ({ timestamp }) =>
    timestamp ? (
      <button
        onClick={() => handleTimestampClick(timestamp)}
        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-1 text-xs font-semibold hover:bg-indigo-100 transition-colors"
        title="Jump to this moment"
      >
        <Clock className="w-3 h-3" />
        {formatTime(timestamp)}
      </button>
    ) : null;

  const Empty = ({ children }) => (
    <div className="text-center text-slate-400 text-sm py-12">{children}</div>
  );

  const renderTab = () => {
    if (activeTab === 'action') {
      return data.actionSteps.length ? (
        <div className="space-y-3">
          {data.actionSteps.map((step, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-800">{step.action}</h3>
                <TimestampChip timestamp={step.timestamp} />
              </div>
              {step.explanation && <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{step.explanation}</p>}
            </div>
          ))}
        </div>
      ) : (
        <Empty>No action steps found for this video.</Empty>
      );
    }
    if (activeTab === 'insights') {
      return data.keyInsights.length ? (
        <div className="space-y-3">
          {data.keyInsights.map((it, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow flex items-start justify-between gap-3">
              <p className="text-slate-800 leading-relaxed">{it.keyInsight}</p>
              <TimestampChip timestamp={it.timestamp} />
            </div>
          ))}
        </div>
      ) : (
        <Empty>No key insights found for this video.</Empty>
      );
    }
    if (activeTab === 'examples') {
      return data.importantExamples.length ? (
        <div className="space-y-3">
          {data.importantExamples.map((it, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow flex items-start justify-between gap-3">
              <p className="text-slate-800 leading-relaxed">{it.example}</p>
              <TimestampChip timestamp={it.timestamp} />
            </div>
          ))}
        </div>
      ) : (
        <Empty>No examples found for this video.</Empty>
      );
    }
    return data.summary ? (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{data.summary}</p>
      </div>
    ) : (
      <Empty>No summary available for this video.</Empty>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-indigo-600 mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-semibold tracking-wide uppercase">YouTube Key Takeaways</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            Turn any video into action steps & insights
          </h1>
          <p className="mt-2 text-slate-500">
            Paste a YouTube link and let Claude distill it — every takeaway linked to the moment it happens.
          </p>
        </header>

        {/* Search card */}
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <form onSubmit={handleVideoSubmission}>
            <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all px-3">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Paste a YouTube video URL…"
                className="flex-1 bg-transparent py-3 text-slate-800 placeholder-slate-400 focus:outline-none"
              />
              {videoUrl && (
                <button type="button" onClick={() => setVideoUrl('')} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Clear">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isLoading ? 'Working…' : 'Analyze'}
              </button>
            </div>
          </form>

          {/* Controls */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              <span className="font-medium text-slate-500">Model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isLoading}
                className="bg-white rounded-md border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="font-medium text-slate-500">Thinking</span>
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                disabled={isLoading}
                className="bg-white rounded-md border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
              >
                {EFFORTS.map((x) => (
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-2xl mx-auto mt-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Live reasoning */}
        {isLoading && (
          <div className="max-w-2xl mx-auto mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
            <div className="flex items-center text-sm font-semibold text-slate-700 mb-3">
              <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-500" />
              {stage || 'Working…'}
            </div>
            {reasoning ? (
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-500 max-h-72 overflow-y-auto font-mono">
                {reasoning}
              </pre>
            ) : (
              <p className="text-xs text-slate-400">Claude is thinking…</p>
            )}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !insights && !error && (
          <div className="max-w-2xl mx-auto mt-10 text-center text-slate-400">
            <BrainCircuit className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">Your action steps, insights, examples, and summary will appear here.</p>
          </div>
        )}

        {/* Results */}
        {videoId && insights && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: video + transcript (sticky on desktop) */}
            <div className="lg:sticky lg:top-6 space-y-4">
              <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-black">
                <div className="relative pb-[56.25%] h-0">
                  <iframe
                    key={videoId}
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute top-0 left-0 w-full h-full"
                  />
                </div>
              </div>

              {!!transcript.length && (
                <details className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden" open>
                  <summary className="cursor-pointer select-none flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700">
                    <FileTextIcon className="w-4 h-4 text-slate-400" /> Transcript
                  </summary>
                  <div className="max-h-64 overflow-y-auto px-2 pb-2 border-t border-slate-100">
                    {transcript.map((entry, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleTimestampClick(entry.start)}
                        className="w-full text-left flex gap-3 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        <span className="text-xs font-medium text-indigo-500 pt-0.5 shrink-0 w-12">
                          {formatTime(entry.start)}
                        </span>
                        <span>{entry.text}</span>
                      </button>
                    ))}
                  </div>
                </details>
              )}

              {reasoning && (
                <details className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <summary className="cursor-pointer select-none flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700">
                    <BrainCircuit className="w-4 h-4 text-slate-400" /> View model reasoning
                  </summary>
                  <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-500 max-h-72 overflow-y-auto font-mono px-4 py-3 border-t border-slate-100">
                    {reasoning}
                  </pre>
                </details>
              )}
            </div>

            {/* Right: tabbed insights */}
            <div className="rounded-2xl border border-slate-200 bg-white/60 shadow-sm p-4 sm:p-5">
              <div className="flex flex-wrap gap-2 mb-4">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                      {counts[tab.id] > 0 && (
                        <span className={`ml-0.5 rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
                          {counts[tab.id]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="lg:max-h-[72vh] lg:overflow-y-auto pr-0.5">{renderTab()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonalDevInsightsApp;
