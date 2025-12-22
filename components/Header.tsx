import React from 'react';
import { AcademicCapIcon, SparklesIcon, BanknotesIcon } from '@heroicons/react/24/solid';

interface HeaderProps {
  totalCoins: number;
  onCoinsClick: () => void;
  activeTab: 'home' | 'settings' | 'help' | 'shop';
  onTabChange: (tab: 'home' | 'settings' | 'help' | 'shop') => void;
  elapsedSeconds: number;
  isOnBreak: boolean;
  onResetPomodoro: () => void;
  activeTheme?: 'default' | 'eye-care' | 'dark' | 'pink' | 'ocean' | 'forest';
}

export const Header: React.FC<HeaderProps> = ({ 
  totalCoins, 
  onCoinsClick, 
  activeTab, 
  onTabChange,
  elapsedSeconds,
  isOnBreak,
  onResetPomodoro,
  activeTheme = 'default'
}) => {
  // 根据主题获取 Header 样式
  const getHeaderClasses = () => {
    switch (activeTheme) {
      case 'eye-care':
        return 'bg-green-50/80 backdrop-blur-lg border-b border-green-200/60';
      case 'dark':
        return 'bg-slate-800/90 backdrop-blur-lg border-b border-slate-700/60';
      case 'pink':
        return 'bg-pink-50/80 backdrop-blur-lg border-b border-pink-200/60';
      case 'ocean':
        return 'bg-blue-50/80 backdrop-blur-lg border-b border-blue-200/60';
      case 'forest':
        return 'bg-green-50/80 backdrop-blur-lg border-b border-green-200/60';
      default:
        return 'bg-white/70 backdrop-blur-lg border-b border-slate-200/60';
    }
  };

  const getPrimaryColorClasses = () => {
    switch (activeTheme) {
      case 'eye-care':
        return { 
          logo: 'from-green-600 to-emerald-600', 
          logoGlow: 'bg-green-500',
          text: 'text-green-600', 
          button: 'bg-green-600', 
          buttonHover: 'hover:bg-green-700', 
          reset: 'text-green-500 hover:text-green-600' 
        };
      case 'dark':
        return { 
          logo: 'from-indigo-600 to-violet-600', 
          logoGlow: 'bg-indigo-500',
          text: 'text-indigo-400', 
          button: 'bg-indigo-600', 
          buttonHover: 'hover:bg-indigo-700', 
          reset: 'text-indigo-400 hover:text-indigo-300' 
        };
      case 'pink':
        return { 
          logo: 'from-pink-600 to-rose-600', 
          logoGlow: 'bg-pink-500',
          text: 'text-pink-600', 
          button: 'bg-pink-600', 
          buttonHover: 'hover:bg-pink-700', 
          reset: 'text-pink-500 hover:text-pink-600' 
        };
      case 'ocean':
        return { 
          logo: 'from-blue-600 to-cyan-600', 
          logoGlow: 'bg-blue-500',
          text: 'text-blue-600', 
          button: 'bg-blue-600', 
          buttonHover: 'hover:bg-blue-700', 
          reset: 'text-blue-500 hover:text-blue-600' 
        };
      case 'forest':
        return { 
          logo: 'from-emerald-600 to-teal-600', 
          logoGlow: 'bg-emerald-500',
          text: 'text-emerald-600', 
          button: 'bg-emerald-600', 
          buttonHover: 'hover:bg-emerald-700', 
          reset: 'text-emerald-500 hover:text-emerald-600' 
        };
      default:
        return { 
          logo: 'from-indigo-600 to-violet-600', 
          logoGlow: 'bg-indigo-500',
          text: 'text-indigo-600', 
          button: 'bg-indigo-600', 
          buttonHover: 'hover:bg-indigo-700', 
          reset: 'text-indigo-500 hover:text-indigo-600' 
        };
    }
  };

  const colors = getPrimaryColorClasses();

  return (
    <header className={`${getHeaderClasses()} sticky top-0 z-40 supports-[backdrop-filter]:bg-opacity-60`}>
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* 左侧：Logo + 标题 */}
          <div className="flex items-center gap-3 group cursor-default">
            <div className="relative">
               <div className={`absolute inset-0 ${colors.logoGlow} rounded-xl blur opacity-20 group-hover:opacity-40 transition-opacity`}></div>
               <div className={`relative bg-gradient-to-br ${colors.logo} p-2.5 rounded-xl shadow-sm`}>
                  <AcademicCapIcon className="w-6 h-6 text-white" />
               </div>
            </div>
            <div>
              <h1 className={`text-xl font-bold ${activeTheme === 'dark' ? 'text-slate-100' : 'text-slate-800'} tracking-tight leading-none`}>
                智能网课<span className={colors.text}>专注度助手</span>
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">AI Study Monitor</p>
            </div>
          </div>

          {/* 中间：导航按钮 */}
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600 flex-1 justify-center">
            <button
              type="button"
              onClick={() => onTabChange('home')}
              className={`px-3 py-1.5 rounded-full transition-all ${
                activeTab === 'home'
                  ? `${colors.button} text-white shadow-sm`
                  : 'hover:bg-slate-100'
              }`}
            >
              首页
            </button>
            <button
              type="button"
              onClick={() => onTabChange('settings')}
              className={`px-3 py-1.5 rounded-full transition-all ${
                activeTab === 'settings'
                  ? `${colors.button} text-white shadow-sm`
                  : 'hover:bg-slate-100'
              }`}
            >
              设置
            </button>
            <button
              type="button"
              onClick={() => onTabChange('help')}
              className={`px-3 py-1.5 rounded-full transition-all ${
                activeTab === 'help'
                  ? `${colors.button} text-white shadow-sm`
                  : 'hover:bg-slate-100'
              }`}
            >
              帮助
            </button>
          </div>
          
          {/* 右侧：Powered by + 番茄钟 + 金币 */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-100/50 rounded-full border border-slate-200/50">
              <SparklesIcon className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium text-slate-600">
                Powered by Qwen
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                番茄钟：{Math.floor(elapsedSeconds / 60)} 分 {elapsedSeconds % 60} 秒
                {isOnBreak ? '（休息）' : '（专注）'}
              </span>
              <button
                type="button"
                onClick={onResetPomodoro}
                className={colors.reset}
              >
                重置
              </button>
            </div>
            <button
              onClick={onCoinsClick}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 shadow-sm hover:bg-amber-100 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-white shadow-inner">
                <BanknotesIcon className="w-4 h-4" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-medium text-amber-700 uppercase tracking-widest">
                  我的金币
                </span>
                <span className="text-xs font-bold text-amber-700">
                  {totalCoins}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};