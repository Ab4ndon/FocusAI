import React from 'react';
import { AcademicCapIcon, SparklesIcon } from '@heroicons/react/24/solid';

export const Header: React.FC = () => {
  return (
    <header className="bg-white/70 backdrop-blur-lg border-b border-slate-200/60 sticky top-0 z-40 supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 h-18 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="relative">
             <div className="absolute inset-0 bg-indigo-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
             <div className="relative bg-gradient-to-br from-indigo-600 to-violet-600 p-2.5 rounded-xl shadow-sm">
                <AcademicCapIcon className="w-6 h-6 text-white" />
             </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">
              智能网课<span className="text-indigo-600">专注度助手</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">AI Study Monitor</p>
          </div>
        </div>
        
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100/50 rounded-full border border-slate-200/50">
          <SparklesIcon className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-medium text-slate-600">
            Powered by Gemini 2.0 Flash
          </span>
        </div>
      </div>
    </header>
  );
};