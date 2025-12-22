import React from 'react';
import { SessionSummary, PostureType } from '../types';
import { POSTURE_LABELS, POSTURE_COLORS } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface SessionReportProps {
  summary: SessionSummary;
  onClose: () => void;
}

const COLORS = {
  [PostureType.GOOD]: '#22c55e',
  [PostureType.SLOUCHING]: '#f97316',
  [PostureType.TOO_CLOSE]: '#ef4444',
  [PostureType.TOO_FAR]: '#eab308',
  [PostureType.UNKNOWN]: '#94a3b8',
};

export const SessionReport: React.FC<SessionReportProps> = ({ summary, onClose }) => {
  const chartData = Object.entries(summary.postureStats)
    .filter(([_, value]) => value > 0)
    .map(([key, value]) => ({
      name: POSTURE_LABELS[key as PostureType],
      value: value,
      color: COLORS[key as PostureType],
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-fade-in-up">
        
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">学习状态分析报告</h2>
            <p className="text-slate-500 text-sm mt-1">本次网课学习质量综合评估</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`p-6 rounded-2xl ${summary.averageScore >= 80 ? 'bg-green-50 text-green-700' : summary.averageScore >= 60 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
              <div className="text-sm font-semibold opacity-80 mb-2">平均专注度</div>
              <div className="text-4xl font-bold">{summary.averageScore}</div>
            </div>
            
            <div className="p-6 rounded-2xl bg-indigo-50 text-indigo-700">
              <div className="text-sm font-semibold opacity-80 mb-2">监测时长</div>
              <div className="text-4xl font-bold">
                {Math.floor(summary.totalDurationSeconds / 60)}<span className="text-lg ml-1">分</span>
                {summary.totalDurationSeconds % 60}<span className="text-lg ml-1">秒</span>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-slate-100 text-slate-700">
              <div className="text-sm font-semibold opacity-80 mb-2">干扰次数</div>
              <div className="text-4xl font-bold">{summary.distractionCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* AI Summary */}
            <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🤖</span>
                <h3 className="font-bold text-slate-800">AI 助教点评</h3>
              </div>
              <div className="prose prose-slate prose-sm max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed text-slate-600">
                  {summary.aiComment}
                </p>
              </div>
            </div>

            {/* Posture Chart */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
              <h3 className="font-bold text-slate-800 mb-4">坐姿分布分析</h3>
              <div className="flex-1 min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md"
          >
            关闭报告并返回
          </button>
        </div>

      </div>
    </div>
  );
};