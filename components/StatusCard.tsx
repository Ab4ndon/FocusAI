import React from 'react';
import { AnalysisResult, PostureType } from '../types';
import { POSTURE_COLORS, POSTURE_LABELS } from '../constants';

interface StatusCardProps {
  result: AnalysisResult | null;
}

export const StatusCard: React.FC<StatusCardProps> = ({ result }) => {
  if (!result) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="h-20 bg-slate-100 rounded mb-4"></div>
        <div className="h-4 bg-slate-200 rounded w-2/3"></div>
      </div>
    );
  }

  const { concentrationScore, posture, isLookingAtScreen } = result;

  // Determine score color
  let scoreColor = 'text-green-500';
  if (concentrationScore < 80) scoreColor = 'text-yellow-500';
  if (concentrationScore < 60) scoreColor = 'text-red-500';

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-2 gap-4">
      {/* Concentration Score */}
      <div className="col-span-2 flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl">
        <span className="text-slate-500 text-sm font-medium uppercase tracking-wider mb-1">当前专注度</span>
        <div className={`text-5xl font-bold ${scoreColor}`}>
          {concentrationScore}
        </div>
      </div>

      {/* Posture Status */}
      <div className="col-span-1 flex flex-col gap-2">
        <span className="text-slate-400 text-xs font-semibold uppercase">坐姿状态</span>
        <div className={`px-3 py-2 rounded-lg text-sm font-bold border ${POSTURE_COLORS[posture] || 'text-slate-600 bg-slate-50'}`}>
          {POSTURE_LABELS[posture]}
        </div>
      </div>

      {/* Eye Contact */}
      <div className="col-span-1 flex flex-col gap-2">
        <span className="text-slate-400 text-xs font-semibold uppercase">视线方向</span>
        <div className={`px-3 py-2 rounded-lg text-sm font-bold border ${isLookingAtScreen 
          ? 'text-blue-600 bg-blue-50 border-blue-200' 
          : 'text-rose-600 bg-rose-50 border-rose-200'}`}>
          {isLookingAtScreen ? '注视屏幕' : '视线游离'}
        </div>
      </div>
    </div>
  );
};