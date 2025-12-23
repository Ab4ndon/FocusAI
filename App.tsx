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
import { PlayIcon, PauseIcon, ArrowPathIcon, DocumentCheckIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';

// 默认参数，可在设置面板中调整
const DEFAULT_MONITOR_INTERVAL_MS = 5000;  // 监测间隔：5s
const DEFAULT_VOICE_ALERT_THRESHOLD = 2;   // 连续异常次数阈值
const VOICE_COOLDOWN_MS = 30000; 
const DEFAULT_POMODORO_WORK_MIN = 25;      // 专注时长（分钟）
const DEFAULT_POMODORO_BREAK_MIN = 5;      // 休息时长（分钟）
const SESSION_STORAGE_KEY = 'focus-ai-sessions-v1';
const COIN_STORAGE_KEY = 'focus-ai-coins-v1';
const PURCHASED_ITEMS_KEY = 'focus-ai-purchased-v1';
const ACTIVE_THEME_KEY = 'focus-ai-theme-v1';
const ACTIVE_VOICE_KEY = 'focus-ai-voice-v1';

type StoredSession = {
  id: string;
  createdAt: number;
  summary: SessionSummary;
  earnedCoins?: number;
};

// 商城商品定义
type ThemeId = 'default' | 'eye-care' | 'dark' | 'pink' | 'ocean' | 'forest';
type VoiceThemeId = 'gentle' | 'strict' | 'energetic' | 'calm' | 'motivational';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'theme' | 'voice';
  preview?: string;
}

const SHOP_THEMES: ShopItem[] = [
  { id: 'default', name: '默认主题', description: '清新简洁的默认配色', price: 0, type: 'theme' },
  { id: 'eye-care', name: '护眼主题', description: '低蓝光护眼配色，长时间学习更舒适', price: 0, type: 'theme' },
  { id: 'dark', name: '深色主题', description: '护眼的深色模式', price: 200, type: 'theme' },
  { id: 'pink', name: '粉色主题', description: '温柔的粉色系', price: 300, type: 'theme' },
  { id: 'ocean', name: '海洋主题', description: '清新的蓝色海洋', price: 250, type: 'theme' },
  { id: 'forest', name: '森林主题', description: '自然的绿色系', price: 280, type: 'theme' },
];

const SHOP_VOICES: ShopItem[] = [
  { id: 'gentle', name: '温柔学姐', description: '温和鼓励的语音风格', price: 0, type: 'voice' },
  { id: 'strict', name: '严厉老师', description: '严格督促的语音风格', price: 0, type: 'voice' },
  { id: 'energetic', name: '活力教练', description: '充满活力的激励语音', price: 150, type: 'voice' },
  { id: 'calm', name: '平静导师', description: '平静舒缓的引导语音', price: 180, type: 'voice' },
  { id: 'motivational', name: '励志演讲', description: '激励人心的演讲风格', price: 200, type: 'voice' },
];

export default function App() {
  const [showGuide, setShowGuide] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [latestResult, setLatestResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportSummary, setReportSummary] = useState<SessionSummary | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // 顶部导航：主页 / 设置 / 帮助 / 商城
  const [activeTab, setActiveTab] = useState<'home' | 'settings' | 'help' | 'shop'>('home');
  
  // 商城相关状态
  const [purchasedItems, setPurchasedItems] = useState<Set<string>>(new Set());
  const [activeTheme, setActiveTheme] = useState<ThemeId>('default');
  const [activeVoiceTheme, setActiveVoiceTheme] = useState<VoiceThemeId>('gentle');
  const [showCoinDetails, setShowCoinDetails] = useState(false);
  const [isChartCollapsed, setIsChartCollapsed] = useState(false);

  // 本地历史记录（localStorage 持久化）
  const [savedSessions, setSavedSessions] = useState<StoredSession[]>([]);

  // 金币系统：总金币与本次获得金币
  const [totalCoins, setTotalCoins] = useState(0);
  const [lastEarnedCoins, setLastEarnedCoins] = useState<number | null>(null);

  // 个性化设置
  const [monitorIntervalMs, setMonitorIntervalMs] = useState(DEFAULT_MONITOR_INTERVAL_MS);
  const [voiceAlertThreshold, setVoiceAlertThreshold] = useState(DEFAULT_VOICE_ALERT_THRESHOLD);
  const [voiceStyle, setVoiceStyle] = useState<'gentle' | 'strict'>('gentle');

  // 番茄钟
  const [workDurationMin, setWorkDurationMin] = useState(DEFAULT_POMODORO_WORK_MIN);
  const [breakDurationMin, setBreakDurationMin] = useState(DEFAULT_POMODORO_BREAK_MIN);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isOnBreak, setIsOnBreak] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeoutRef = useRef<number | null>(null);
  
  const consecutiveBadCountRef = useRef(0);
  const lastVoiceAlertTimeRef = useRef(0);
  // 使用 ref 跟踪监测状态，确保在异步操作中能获取最新值
  const isMonitoringRef = useRef(isMonitoring);

  const speakText = async (text: string, force: boolean = false, styleOverride?: VoiceThemeId) => {
    // 正常提醒时要受监测状态和连续异常次数限制；试听时可强制播放
    if (!force && !isMonitoring && !consecutiveBadCountRef.current) return; 
    
    try {
      // 使用传入的风格覆盖，或使用当前激活的语音主题
      const voiceStyleToUse = styleOverride || activeVoiceTheme;
      await generateSpeech(text, voiceStyleToUse);
    } catch (e: any) {
      console.warn("TTS failed, falling back to basic browser TTS", e);
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
      consecutiveBadCountRef.current >= voiceAlertThreshold && 
      timeSinceLastAlert > VOICE_COOLDOWN_MS
    ) {
      speakText(result.feedback, false, activeVoiceTheme);
      lastVoiceAlertTimeRef.current = now;
      consecutiveBadCountRef.current = 0; 
    }
  };

  const captureAndAnalyze = useCallback(async () => {
    // 使用 ref 检查监测状态，确保获取最新值
    if (!isMonitoringRef.current) return;

    if (!videoRef.current || !canvasRef.current) {
        // 在设置 timeout 前再次检查监测状态
        if (isMonitoringRef.current) {
          timeoutRef.current = window.setTimeout(captureAndAnalyze, 1000);
        }
        return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 图像压缩：限制宽度到 640px，并进行 JPEG 质量压缩以减少带宽和 token 消耗
    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const targetWidth = Math.min(640, sourceWidth);
    const scale = targetWidth / sourceWidth;
    const targetHeight = Math.round(sourceHeight * scale);

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];

    try {
      const result = await analyzeStudentState(base64Image);
      
      // 在更新状态前再次检查监测状态，防止在异步操作期间状态已改变
      if (!isMonitoringRef.current) return;
      
      const timestampedResult = { ...result, timestamp: Date.now() };
      
      setLatestResult(timestampedResult);
      setHistory(prev => [...prev, timestampedResult]);
      setError(null);

      handleVoiceAlert(timestampedResult);

      // 在设置 timeout 前再次检查监测状态
      if (isMonitoringRef.current) {
        timeoutRef.current = window.setTimeout(captureAndAnalyze, monitorIntervalMs);
      }

    } catch (err: any) {
      console.error("Analysis failed:", err);
      
      // 在错误处理前检查监测状态
      if (!isMonitoringRef.current) return;
      
      let errorMessage = "AI 分析服务暂时不可用";
      let nextRetryTime = monitorIntervalMs;

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
      // 在设置 timeout 前再次检查监测状态
      if (isMonitoringRef.current) {
        timeoutRef.current = window.setTimeout(captureAndAnalyze, nextRetryTime);
      }
    }
  }, [isMonitoring, monitorIntervalMs, voiceAlertThreshold]);

  // 同步 ref 和 state
  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
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
      setElapsedSeconds(0);
      setIsOnBreak(false);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isMonitoring, captureAndAnalyze]);

  const handleToggleMonitoring = () => {
    const newMonitoringState = !isMonitoring;
    setIsMonitoring(newMonitoringState);
    // 如果停止监测，立即清除 timeout
    if (!newMonitoringState && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleStopAndReport = async () => {
    // 立即停止监测并清除所有 timeout
    setIsMonitoring(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (history.length === 0) return;

    setIsGeneratingReport(true);
    
    const totalScore = history.reduce((sum, item) => sum + item.concentrationScore, 0);
    const avgScore = Math.round(totalScore / history.length);
    const duration = history.length * (monitorIntervalMs / 1000); 
    const distractionCount = history.filter(h => h.detectedDistractions.length > 0 || h.hasElectronicDevice).length;
    
    const postureStats = history.reduce((acc, item) => {
      acc[item.posture] = (acc[item.posture] || 0) + 1;
      return acc;
    }, {} as Record<PostureType, number>);

    const aiComment = await generateSessionSummary(history);

    // 结算金币（静默积分）：coins = (avgScore / 10) * 学习时长(分钟)
    const durationMinutes = Math.max(1, Math.round(duration / 60));
    const earnedCoins = Math.max(0, Math.round((avgScore / 10) * durationMinutes));

    const summary: SessionSummary = {
      averageScore: avgScore,
      totalDurationSeconds: duration,
      distractionCount,
      postureStats,
      aiComment
    };

    setReportSummary(summary);
    setLastEarnedCoins(earnedCoins);

    // 更新总金币并持久化
    setTotalCoins(prev => {
      const next = prev + earnedCoins;
      if (typeof window !== 'undefined') {
        localStorage.setItem(COIN_STORAGE_KEY, String(next));
      }
      return next;
    });

    // 同步保存到本地历史记录（localStorage）
    try {
      const newSession: StoredSession = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        summary,
        earnedCoins,
      };
      setSavedSessions((prev) => {
        const next = [newSession, ...prev].slice(0, 50); // 只保留最近 50 条
        if (typeof window !== 'undefined') {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
        }
        return next;
      });
    } catch (e) {
      console.warn('保存本地历史记录失败', e);
    }

    setIsGeneratingReport(false);
    setShowReport(true);
  };

  const handleClearHistory = () => {
    setHistory([]);
    setLatestResult(null);
    consecutiveBadCountRef.current = 0;
  };

  // 购买商品
  const handlePurchase = (item: ShopItem) => {
    if (purchasedItems.has(item.id)) return; // 已购买
    if (totalCoins < item.price) {
      alert(`金币不足！需要 ${item.price} 金币，当前拥有 ${totalCoins} 金币。`);
      return;
    }
    const newPurchased = new Set(purchasedItems);
    newPurchased.add(item.id);
    setPurchasedItems(newPurchased);
    setTotalCoins(prev => {
      const next = prev - item.price;
      if (typeof window !== 'undefined') {
        localStorage.setItem(COIN_STORAGE_KEY, String(next));
        localStorage.setItem(PURCHASED_ITEMS_KEY, JSON.stringify(Array.from(newPurchased)));
      }
      return next;
    });
  };

  // 应用主题
  const handleApplyTheme = (themeId: ThemeId) => {
    setActiveTheme(themeId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_THEME_KEY, themeId);
    }
  };

  // 应用语音主题
  const handleApplyVoice = (voiceId: VoiceThemeId) => {
    setActiveVoiceTheme(voiceId);
    if (voiceId === 'gentle' || voiceId === 'strict') {
      setVoiceStyle(voiceId);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_VOICE_KEY, voiceId);
    }
  };

  // 从 localStorage 加载历史学习记录 & 总金币 & 商城数据
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredSession[];
        if (Array.isArray(parsed)) {
          setSavedSessions(parsed);
        }
      }
      const coinRaw = localStorage.getItem(COIN_STORAGE_KEY);
      if (coinRaw) {
        const parsedCoins = Number(coinRaw);
        if (!Number.isNaN(parsedCoins) && parsedCoins >= 0) {
          setTotalCoins(parsedCoins);
        }
      }
      const purchasedRaw = localStorage.getItem(PURCHASED_ITEMS_KEY);
      if (purchasedRaw) {
        const parsed = JSON.parse(purchasedRaw) as string[];
        if (Array.isArray(parsed)) {
          const items = new Set(parsed);
          // 确保默认免费项目始终解锁
          items.add('default');
          items.add('eye-care');
          items.add('gentle');
          items.add('strict');
          setPurchasedItems(items);
        } else {
          setPurchasedItems(new Set(['default', 'eye-care', 'gentle', 'strict']));
        }
      } else {
        // 首次加载，默认解锁免费项目
        setPurchasedItems(new Set(['default', 'eye-care', 'gentle', 'strict']));
      }
      const themeRaw = localStorage.getItem(ACTIVE_THEME_KEY);
      if (themeRaw && ['default', 'eye-care', 'dark', 'pink', 'ocean', 'forest'].includes(themeRaw)) {
        setActiveTheme(themeRaw as ThemeId);
      }
      const voiceRaw = localStorage.getItem(ACTIVE_VOICE_KEY);
      if (voiceRaw && ['gentle', 'strict', 'energetic', 'calm', 'motivational'].includes(voiceRaw)) {
        setActiveVoiceTheme(voiceRaw as VoiceThemeId);
        if (voiceRaw === 'gentle' || voiceRaw === 'strict') {
          setVoiceStyle(voiceRaw);
        }
      }
    } catch (e) {
      console.warn('加载本地数据失败', e);
    }
  }, []);

  // 番茄钟计时：专注 25 分钟建议休息 5 分钟
  useEffect(() => {
    if (!isMonitoring) return;

    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;

        const workSeconds = workDurationMin * 60;
        const breakSeconds = breakDurationMin * 60;

        // 到达专注时长，提醒休息
        if (!isOnBreak && next >= workSeconds) {
          const text = getPomodoroWorkText(activeVoiceTheme);
          speakText(text, false, activeVoiceTheme);
          setIsOnBreak(true);
          return next;
        }

        // 休息结束，提醒继续学习，并重置计时
        if (isOnBreak && next >= workSeconds + breakSeconds) {
          const text = getPomodoroBreakText(activeVoiceTheme);
          speakText(text, false, activeVoiceTheme);
          setIsOnBreak(false);
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isMonitoring, isOnBreak, workDurationMin, breakDurationMin, activeVoiceTheme]);

  // 根据语音风格生成番茄钟工作结束提醒文本
  const getPomodoroWorkText = (style: VoiceThemeId): string => {
    switch (style) {
      case 'strict':
        return '已经学习二十五分钟了，现在必须休息五分钟，站起来做做眼保健操和伸展运动。';
      case 'energetic':
        return '太棒了！专注学习二十五分钟，现在立刻起身活动，做眼保健操和伸展运动，让身体和眼睛都放松一下！';
      case 'calm':
        return '你已经专注学习了二十五分钟，现在请慢慢起身，做做眼保健操和轻柔的伸展运动，让身心得到放松。';
      case 'motivational':
        return '优秀！你已经坚持专注学习二十五分钟了，现在起身活动，做眼保健操和伸展运动，为下一轮学习做好准备！';
      case 'gentle':
      default:
        return '太棒了，已经专注学习二十五分钟啦，起来活动一下，做做眼保健操和伸展运动，给自己一个小休息～';
    }
  };

  // 根据语音风格生成番茄钟休息结束提醒文本
  const getPomodoroBreakText = (style: VoiceThemeId): string => {
    switch (style) {
      case 'strict':
        return '休息时间结束了，现在请回到座位继续专心上课。';
      case 'energetic':
        return '休息结束！让我们继续充满活力地学习，回到座位，保持专注！';
      case 'calm':
        return '休息时间到了，请平静地回到座位，继续你的学习之旅。';
      case 'motivational':
        return '休息结束，现在回到座位，继续保持专注，你的学习之路还在继续！';
      case 'gentle':
      default:
        return '休息结束啦～欢迎回到课堂，咱们继续专心学习吧。';
    }
  };

  // 根据主题获取对应的样式类
  const getThemeClasses = () => {
    switch (activeTheme) {
      case 'eye-care':
        return 'min-h-screen bg-gradient-to-br from-green-50 to-emerald-50/50 text-slate-900';
      case 'dark':
        return 'min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100';
      case 'pink':
        return 'min-h-screen bg-gradient-to-br from-pink-50 to-rose-50/50 text-slate-900';
      case 'ocean':
        return 'min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50/50 text-slate-900';
      case 'forest':
        return 'min-h-screen bg-gradient-to-br from-green-50 to-teal-50/50 text-slate-900';
      case 'default':
      default:
        return 'min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/50 text-slate-900';
    }
  };

  return (
    <div className={`${getThemeClasses()} flex flex-col font-sans`}>
      <Header 
        totalCoins={totalCoins} 
        onCoinsClick={() => setActiveTab('shop')}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        elapsedSeconds={elapsedSeconds}
        isOnBreak={isOnBreak}
        onResetPomodoro={() => { setElapsedSeconds(0); setIsOnBreak(false); }}
        activeTheme={activeTheme}
      />
      
      {showGuide && (
        <GuideModal onStart={() => setShowGuide(false)} />
      )}

      {showReport && reportSummary && (
        <SessionReport 
          summary={reportSummary} 
          earnedCoins={lastEarnedCoins ?? 0}
          onClose={() => setShowReport(false)} 
        />
      )}

      {/* 首页：摄像头 + 仪表盘 */}
      {activeTab === 'home' && (
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 flex flex-col gap-8">
        
        {/* Top Section: Camera & Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Camera & Controls & Chart */}
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

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <span className="text-xs font-medium text-slate-400 px-3 py-1 bg-slate-100 rounded-full">
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

            {/* Chart Section - Moved to Left Column */}
            <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden transition-all duration-300" style={{ height: isChartCollapsed ? '60px' : '400px' }}>
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-bold text-slate-800">专注度趋势图</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span> 实时专注度
                  </div>
                </div>
                <button
                  onClick={() => setIsChartCollapsed(!isChartCollapsed)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  {isChartCollapsed ? (
                    <>
                      <ChevronDownIcon className="w-4 h-4" />
                      <span>展开</span>
                    </>
                  ) : (
                    <>
                      <ChevronUpIcon className="w-4 h-4" />
                      <span>折叠</span>
                    </>
                  )}
                </button>
              </div>
              {!isChartCollapsed && (
                <div className="p-6 h-[calc(100%-80px)]">
                  <HistoryChart data={history.slice(-20)} />
                </div>
              )}
            </div>
          </div>

        {/* Right Column: Status Dashboard */}
        <div className="lg:col-span-1 space-y-6">
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
                {latestResult?.feedback || "同学你好！我是你的 AI 助教。点击「开始上课」，我会时刻关注你的学习状态，并在需要时提醒你哦。"}
                </p>
            </div>
          </div>

          {/* 本地历史记录卡片 */}
          <div className="bg-white/90 backdrop-blur-md rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="text-sm font-semibold text-slate-800">本机学习历史</h3>
              {savedSessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSavedSessions([]);
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem(SESSION_STORAGE_KEY);
                    }
                  }}
                  className="text-[11px] text-slate-400 hover:text-red-500"
                >
                  清空
                </button>
              )}
            </div>
            {savedSessions.length === 0 ? (
              <p className="text-xs text-slate-400 flex-shrink-0">
                还没有历史记录。完成一次「下课并生成报告」后，这里会保存最近的学习情况，仅存储在本浏览器中。
              </p>
            ) : (
              <div 
                className="overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar flex-1"
                style={{ 
                  height: '192px', // 固定高度，约显示3条记录的高度
                  minHeight: '192px',
                  maxHeight: '192px'
                }}
              >
                <ul className="space-y-2">
                  {savedSessions.map((s) => {
                    const date = new Date(s.createdAt);
                    const minutes = Math.round(s.summary.totalDurationSeconds / 60);
                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-100 px-3 py-2 text-xs bg-slate-50/80 flex-shrink-0"
                        style={{ minHeight: '60px' }} // 确保每条记录有固定高度
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800">
                            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-slate-500 mt-0.5">
                            平均专注度 {s.summary.averageScore} 分 · 时长约 {minutes} 分钟 · 干扰 {s.summary.distractionCount} 次
                          </span>
                        </div>
                        <span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 flex-shrink-0">
                          查看报告
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

        </div>
        </div>
      </main>
      )}

      {/* 设置页：集中展示所有自定义设置与试听 */}
      {activeTab === 'settings' && (
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 lg:p-8">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-md border border-slate-100 p-6 lg:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">智能监测设置</h2>
                <p className="text-xs text-slate-400 mt-1">
                  根据你的学习习惯、设备性能和流量情况，个性化调整监测参数和语音风格。
                </p>
              </div>
              <div className="inline-flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                当前番茄钟：{Math.floor(elapsedSeconds / 60)} 分 {elapsedSeconds % 60} 秒
                {isOnBreak ? '（休息中）' : '（专注中）'}
              </div>
            </div>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">监测频率</h3>
                <p className="text-[11px] text-slate-400">
                  频率越高越及时，但会略微增加 API 调用次数和网络开销。
                </p>
                <select
                  value={monitorIntervalMs}
                  onChange={(e) => setMonitorIntervalMs(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 bg-slate-50"
                >
                  <option value={3000}>每 3 秒分析一次（更灵敏）</option>
                  <option value={5000}>每 5 秒分析一次（推荐）</option>
                  <option value={10000}>每 10 秒分析一次（省流量）</option>
                </select>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">灵敏度</h3>
                <p className="text-[11px] text-slate-400">
                  灵敏度越高，短暂的小动作也会触发提醒；可根据自律程度选择。
                </p>
                <select
                  value={voiceAlertThreshold}
                  onChange={(e) => setVoiceAlertThreshold(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 bg-slate-50"
                >
                  <option value={1}>严格模式：一次异常就提醒</option>
                  <option value={2}>平衡模式：连续 2 次异常提醒</option>
                  <option value={3}>宽松模式：连续 3 次异常提醒</option>
                </select>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">语音风格与试听</h3>
              <p className="text-[11px] text-slate-400">
                选择你更喜欢的提醒语气，并点击下方按钮试听效果。
              </p>
              <div className="grid gap-4 sm:grid-cols-[2fr,3fr] items-start">
                <select
                  value={voiceStyle}
                  onChange={(e) => setVoiceStyle(e.target.value as 'gentle' | 'strict')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 bg-slate-50"
                >
                  <option value="gentle">温柔学姐风格</option>
                  <option value="strict">严厉老师风格</option>
                </select>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      speakText(
                        '同学加油～我会温柔地提醒你保持专注和良好坐姿，一起高效完成这节课。',
                        true,
                        'gentle'
                      )
                    }
                    className="flex-1 rounded-full border border-indigo-100 px-3 py-2 text-xs sm:text-sm text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center"
                  >
                    试听温柔学姐
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      speakText(
                        '注意坐姿和专注度，老师已经发现你有些走神了，请立刻回到学习状态。',
                        true,
                        'strict'
                      )
                    }
                    className="flex-1 rounded-full border border-amber-100 px-3 py-2 text-xs sm:text-sm text-amber-700 hover:bg-amber-50 transition-colors flex items-center justify-center"
                  >
                    试听严厉老师
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-800">番茄钟设置</h3>
              <p className="text-[11px] text-slate-400">
                经典 25 / 5 番茄工作法，可根据课程节奏微调专注与休息时间。
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-slate-600 text-sm font-medium">专注时长（分钟）</p>
                  <input
                    type="number"
                    min={10}
                    max={60}
                    value={workDurationMin}
                    onChange={(e) =>
                      setWorkDurationMin(
                        Math.max(10, Math.min(60, Number(e.target.value) || DEFAULT_POMODORO_WORK_MIN))
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 bg-slate-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-slate-600 text-sm font-medium">休息时长（分钟）</p>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={breakDurationMin}
                    onChange={(e) =>
                      setBreakDurationMin(
                        Math.max(3, Math.min(20, Number(e.target.value) || DEFAULT_POMODORO_BREAK_MIN))
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 bg-slate-50"
                  />
                </div>
              </div>
            </section>
          </div>
        </main>
      )}

      {/* 帮助页：使用指南与隐私说明 */}
      {activeTab === 'help' && (
        <main className="flex-1 max-w-3xl w-full mx-auto p-4 lg:p-8">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-md border border-slate-100 p-6 lg:p-8 space-y-5">
            <h2 className="text-lg font-bold text-slate-900">使用帮助</h2>
            <section className="space-y-2 text-sm text-slate-600">
              <h3 className="font-semibold text-slate-800">1. 基本流程</h3>
              <p>允许摄像头权限后，点击「开始上课」，系统会每隔数秒抓取一帧画面，分析你的专注度、坐姿和电子设备使用情况。</p>
              <p>当连续多次检测到走神或姿态不佳时，AI 会以你选择的语音风格进行提醒。</p>
            </section>
            <section className="space-y-2 text-sm text-slate-600">
              <h3 className="font-semibold text-slate-800">2. 番茄钟与休息建议</h3>
              <p>默认采用 25 分钟专注 + 5 分钟休息的番茄工作法，到点后会提醒你起身活动、做眼保健操和伸展运动。</p>
              <p>你可以在「设置」页中自定义专注与休息时长，系统会自动循环专注-休息节奏。</p>
            </section>
            <section className="space-y-2 text-sm text-slate-600">
              <h3 className="font-semibold text-slate-800">3. 隐私与数据安全</h3>
              <p>本工具仅在浏览器本地采集摄像头画面帧，并发送压缩后的单帧图像给后端模型分析，不会长时间存储你的视频数据。</p>
              <p>请在个人设备和可信网络环境下使用，如需在公共场景使用，请注意周围他人的隐私和个人信息保护。</p>
            </section>
          </div>
        </main>
      )}

      {/* 商城页：金币管理、明细、主题与语音购买 */}
      {activeTab === 'shop' && (
        <main className="flex-1 max-w-6xl w-full mx-auto p-4 lg:p-8 space-y-6">
          {/* 顶部：总金币展示 */}
          <div className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-300 rounded-3xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/30 flex items-center justify-center shadow-inner">
                  <span className="text-3xl">🪙</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900/80 uppercase tracking-widest">我的总金币</p>
                  <p className="text-4xl font-extrabold text-amber-900">{totalCoins}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCoinDetails(!showCoinDetails)}
                className="px-4 py-2 bg-white/80 hover:bg-white rounded-xl text-sm font-semibold text-amber-900 shadow-md transition-all"
              >
                {showCoinDetails ? '收起明细' : '查看明细'}
              </button>
            </div>
          </div>

          {/* 金币明细列表 */}
          {showCoinDetails && (
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-md border border-slate-100 p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">金币明细</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {savedSessions
                  .filter(s => s.earnedCoins && s.earnedCoins > 0)
                  .map((s) => {
                    const date = new Date(s.createdAt);
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-xs text-slate-500">
                            专注度 {s.summary.averageScore} 分 · 学习 {Math.round(s.summary.totalDurationSeconds / 60)} 分钟
                          </p>
                        </div>
                        <span className="text-lg font-bold text-amber-600">+{s.earnedCoins}</span>
                      </div>
                    );
                  })}
                {savedSessions.filter(s => s.earnedCoins && s.earnedCoins > 0).length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">暂无金币获得记录</p>
                )}
              </div>
            </div>
          )}

          {/* 商城：页面主题 */}
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-md border border-slate-100 p-6 lg:p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-2">🎨 页面主题</h2>
            <p className="text-sm text-slate-500 mb-6">购买并应用你喜欢的页面主题</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SHOP_THEMES.map((theme) => {
                const isPurchased = purchasedItems.has(theme.id) || theme.price === 0;
                const isActive = activeTheme === theme.id;
                return (
                  <div
                    key={theme.id}
                    className={`relative rounded-2xl border-2 p-4 transition-all ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 shadow-lg'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full">
                        使用中
                      </div>
                    )}
                    <div className="mb-3">
                      <h3 className="font-bold text-slate-800">{theme.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{theme.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-lg font-bold text-amber-600">
                        {theme.price === 0 ? '免费' : `${theme.price} 金币`}
                      </span>
                      {isPurchased ? (
                        <button
                          onClick={() => handleApplyTheme(theme.id as ThemeId)}
                          disabled={isActive}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            isActive
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {isActive ? '已应用' : '应用'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePurchase(theme)}
                          disabled={totalCoins < theme.price}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            totalCoins < theme.price
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-amber-500 text-white hover:bg-amber-600'
                          }`}
                        >
                          购买
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 商城：语音主题 */}
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-md border border-slate-100 p-6 lg:p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-2">🎤 语音主题</h2>
            <p className="text-sm text-slate-500 mb-6">解锁更多语音风格，让学习更有趣</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SHOP_VOICES.map((voice) => {
                const isPurchased = purchasedItems.has(voice.id) || voice.price === 0;
                const isActive = activeVoiceTheme === voice.id;
                return (
                  <div
                    key={voice.id}
                    className={`relative rounded-2xl border-2 p-4 transition-all ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 shadow-lg'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full">
                        使用中
                      </div>
                    )}
                    <div className="mb-3">
                      <h3 className="font-bold text-slate-800">{voice.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">{voice.description}</p>
                    </div>
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          const demoTexts: Record<string, string> = {
                            gentle: '同学加油～我会温柔地提醒你保持专注和良好坐姿，一起高效完成这节课。',
                            strict: '注意坐姿和专注度，老师已经发现你有些走神了，请立刻回到学习状态。',
                            energetic: '太棒了！继续保持专注，你的学习状态非常棒，坚持下去！',
                            calm: '请保持平静的心态，专注于当前的学习任务，慢慢来，不着急。',
                            motivational: '你已经做得很好了，继续保持这种专注的状态，成功就在前方！',
                          };
                          speakText(demoTexts[voice.id] || demoTexts.gentle, true, voice.id as VoiceThemeId);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      >
                        🎤 试听
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-lg font-bold text-amber-600">
                        {voice.price === 0 ? '免费' : `${voice.price} 金币`}
                      </span>
                      {isPurchased ? (
                        <button
                          onClick={() => handleApplyVoice(voice.id as VoiceThemeId)}
                          disabled={isActive}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            isActive
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {isActive ? '已应用' : '应用'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePurchase(voice)}
                          disabled={totalCoins < voice.price}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                            totalCoins < voice.price
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-amber-500 text-white hover:bg-amber-600'
                          }`}
                        >
                          购买
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}