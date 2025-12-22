import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { StatusCard } from './components/StatusCard';
import { HistoryChart } from './components/HistoryChart';
import { AlertPanel } from './components/AlertPanel';
import { Header } from './components/Header';
import { SessionReport } from './components/SessionReport';
import { GuideModal } from './components/GuideModal';
import { analyzeStudentState, generateSessionSummary, generateSpeech } from './services/geminiService';
import { AnalysisResult, PostureType, SessionSummary } from './types';
import { PlayIcon, PauseIcon, ArrowPathIcon, DocumentCheckIcon } from '@heroicons/react/24/solid';

// Faster interval for stable models
const MONITOR_INTERVAL_MS = 5000; 
const VOICE_ALERT_THRESHOLD = 2; 
const VOICE_COOLDOWN_MS = 30000; 

export default function App() {
  const [showGuide, setShowGuide] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [latestResult, setLatestResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportSummary, setReportSummary] = useState<SessionSummary | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeoutRef = useRef<number | null>(null);
  
  const consecutiveBadCountRef = useRef(0);
  const lastVoiceAlertTimeRef = useRef(0);

  const speakText = async (text: string) => {
    if (!isMonitoring && !consecutiveBadCountRef.current) return; 
    
    try {
      await generateSpeech(text);
    } catch (e: any) {
      console.warn("Gemini TTS failed (likely quota), falling back to browser TTS", e);
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        window.speechSynthesis.speak(u);
      }
    }
  };

  const handleVoiceAlert = (result: AnalysisResult) => {
    const isBadState = 
      result.concentrationScore < 60 || 
      result.posture !== PostureType.GOOD || 
      result.hasElectronicDevice;

    if (isBadState) {
      consecutiveBadCountRef.current += 1;
    } else {
      consecutiveBadCountRef.current = 0; 
    }

    const now = Date.now();
    const timeSinceLastAlert = now - lastVoiceAlertTimeRef.current;

    if (
      consecutiveBadCountRef.current >= VOICE_ALERT_THRESHOLD && 
      timeSinceLastAlert > VOICE_COOLDOWN_MS
    ) {
      speakText(result.feedback);
      lastVoiceAlertTimeRef.current = now;
      consecutiveBadCountRef.current = 0; 
    }
  };

  const captureAndAnalyze = useCallback(async () => {
    if (!isMonitoring) return;

    if (!videoRef.current || !canvasRef.current) {
        timeoutRef.current = window.setTimeout(captureAndAnalyze, 1000);
        return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    try {
      const result = await analyzeStudentState(base64Image);
      const timestampedResult = { ...result, timestamp: Date.now() };
      
      setLatestResult(timestampedResult);
      setHistory(prev => [...prev, timestampedResult]);
      setError(null);

      handleVoiceAlert(timestampedResult);

      timeoutRef.current = window.setTimeout(captureAndAnalyze, MONITOR_INTERVAL_MS);

    } catch (err: any) {
      console.error("Analysis failed:", err);
      
      let errorMessage = "AI 分析服务暂时不可用";
      let nextRetryTime = MONITOR_INTERVAL_MS;

      const errMessage = err?.message || '';
      const errString = JSON.stringify(err);
      
      const isQuotaError = 
        errMessage.includes('429') || 
        errMessage.includes('quota') || 
        errMessage.includes('RESOURCE_EXHAUSTED') ||
        errString.includes('429') || 
        errString.includes('quota') ||
        errString.includes('RESOURCE_EXHAUSTED');

      const isNotFoundError = 
        errMessage.includes('404') ||
        errMessage.includes('NOT_FOUND') ||
        errString.includes('404') ||
        errString.includes('NOT_FOUND');

      const isConfigError = 
        errMessage.includes('API Key') || 
        errMessage.includes('API_KEY');

      if (isQuotaError) {
        errorMessage = "API 请求频率过高，已自动暂停 60 秒...";
        nextRetryTime = 60000; 
      } else if (isNotFoundError) {
        errorMessage = "错误：配置的模型不可用 (404)。请联系管理员。";
        nextRetryTime = 60000; 
      } else if (isConfigError) {
        errorMessage = "未配置 API Key。请检查 Netlify 部署设置中的环境变量。";
        setError(errorMessage);
        setIsMonitoring(false); // Stop monitoring immediately
        return; // Exit without rescheduling
      } else {
        errorMessage = "网络连接不稳定，正在重试...";
      }

      setError(errorMessage);
      timeoutRef.current = window.setTimeout(captureAndAnalyze, nextRetryTime);
    }
  }, [isMonitoring]);

  useEffect(() => {
    if (isMonitoring) {
      captureAndAnalyze();
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      consecutiveBadCountRef.current = 0;
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isMonitoring, captureAndAnalyze]);

  const handleToggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
  };

  const handleStopAndReport = async () => {
    setIsMonitoring(false);
    if (history.length === 0) return;

    setIsGeneratingReport(true);
    
    const totalScore = history.reduce((sum, item) => sum + item.concentrationScore, 0);
    const avgScore = Math.round(totalScore / history.length);
    const duration = history.length * (MONITOR_INTERVAL_MS / 1000); 
    const distractionCount = history.filter(h => h.detectedDistractions.length > 0 || h.hasElectronicDevice).length;
    
    const postureStats = history.reduce((acc, item) => {
      acc[item.posture] = (acc[item.posture] || 0) + 1;
      return acc;
    }, {} as Record<PostureType, number>);

    const aiComment = await generateSessionSummary(history);

    setReportSummary({
      averageScore: avgScore,
      totalDurationSeconds: duration,
      distractionCount,
      postureStats,
      aiComment
    });

    setIsGeneratingReport(false);
    setShowReport(true);
  };

  const handleClearHistory = () => {
    setHistory([]);
    setLatestResult(null);
    consecutiveBadCountRef.current = 0;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/50 text-slate-900 flex flex-col font-sans">
      <Header />
      
      {showGuide && (
        <GuideModal onStart={() => setShowGuide(false)} />
      )}

      {showReport && reportSummary && (
        <SessionReport 
          summary={reportSummary} 
          onClose={() => setShowReport(false)} 
        />
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Camera & Controls */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Camera Section */}
          <div className="bg-white rounded-3xl shadow-lg shadow-indigo-100/50 border border-slate-100 p-2 overflow-hidden relative">
            <div className="absolute top-6 left-6 z-20 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md flex items-center gap-2 font-medium shadow-sm transition-all duration-300">
              <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              {isMonitoring ? 'AI 正在分析...' : '准备就绪'}
            </div>
            <CameraFeed videoRef={videoRef} />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 backdrop-blur-xl p-5 rounded-2xl shadow-sm border border-white/50">
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleMonitoring}
                disabled={isGeneratingReport}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all transform active:scale-95 ${
                  isMonitoring 
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200/50' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5'
                }`}
              >
                {isMonitoring ? (
                  <>
                    <PauseIcon className="w-5 h-5" /> 暂停监测
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-5 h-5" /> 开始上课
                  </>
                )}
              </button>

              <button
                onClick={handleStopAndReport}
                disabled={history.length === 0 || isGeneratingReport}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all border ${
                   history.length === 0 || isGeneratingReport
                   ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                   : 'bg-white text-indigo-600 hover:bg-indigo-50 border-indigo-100 shadow-sm hover:shadow'
                }`}
              >
                {isGeneratingReport ? (
                   <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
                ) : (
                   <DocumentCheckIcon className="w-5 h-5" />
                )}
                <span>下课并生成报告</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-slate-400 hidden sm:inline px-3 py-1 bg-slate-100 rounded-full">
                智能语音提醒开启中
              </span>
              <button 
                onClick={handleClearHistory}
                disabled={isMonitoring}
                className="text-slate-400 hover:text-red-500 p-2.5 rounded-full hover:bg-red-50 transition-colors disabled:opacity-50"
                title="清除历史记录"
              >
                <ArrowPathIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl shadow-sm border border-slate-100 h-80 relative">
             <div className="absolute top-6 right-6">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 实时专注度
                </div>
             </div>
            <h3 className="text-lg font-bold text-slate-800 mb-6">专注度趋势图</h3>
            <HistoryChart data={history.slice(-20)} />
          </div>
        </div>

        {/* Right Column: Status Dashboard */}
        <div className="space-y-6">
           {error && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl shadow-sm animate-fade-in-up">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm font-medium text-amber-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <StatusCard result={latestResult} />
          
          <div className="bg-white/60 backdrop-blur-md rounded-3xl p-1 shadow-sm border border-white/50">
             <AlertPanel result={latestResult} />
          </div>
          
          {/* AI Feedback Bubble */}
          <div className="relative mt-4">
            <div className="absolute -top-3 left-6 w-6 h-6 bg-indigo-600 rotate-45 transform origin-bottom-left rounded-sm z-0"></div>
            <div className="relative bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-3xl shadow-lg shadow-indigo-200 text-white z-10">
                <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-3">
                    <div className="p-1.5 bg-white/20 rounded-lg">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    </div>
                    <h3 className="font-bold text-lg">AI 助教</h3>
                </div>
                <p className="text-indigo-50 text-sm leading-relaxed min-h-[60px] font-medium">
                {latestResult?.feedback || "同学你好！我是你的 AI 助教。点击“开始上课”，我会时刻关注你的学习状态，并在需要时提醒你哦。"}
                </p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}