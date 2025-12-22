import React from 'react';
import { CameraIcon, CheckCircleIcon, FaceSmileIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';

interface GuideModalProps {
  onStart: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ onStart }) => {
  const steps = [
    {
      icon: <CameraIcon className="w-8 h-8 text-indigo-500" />,
      title: "摆正摄像头",
      desc: "请确保您的上半身完整出现在画面中，面部清晰可见，不要背光。"
    },
    {
      icon: <FaceSmileIcon className="w-8 h-8 text-indigo-500" />,
      title: "保持良好坐姿",
      desc: "请保持腰背挺直，眼睛与屏幕保持适当距离（约50cm）。"
    },
    {
      icon: <SpeakerWaveIcon className="w-8 h-8 text-indigo-500" />,
      title: "开启音量",
      desc: "请调大设备音量，AI 助教会通过自然语音提醒您保持专注。"
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up">
        
        <div className="relative h-32 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <h2 className="text-3xl font-bold text-white tracking-tight relative z-10">欢迎使用</h2>
        </div>

        <div className="p-8">
          <p className="text-slate-600 mb-8 text-center text-lg">
            在开始监测前，请花一点时间确认以下事项：
          </p>

          <div className="space-y-6">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                <div className="shrink-0 p-2 bg-indigo-50 rounded-lg">
                  {step.icon}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{step.title}</h3>
                  <p className="text-slate-500 text-sm mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <button
              onClick={onStart}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2 group"
            >
              <span>我准备好了</span>
              <CheckCircleIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>
            <p className="text-center text-xs text-slate-400 mt-4">
              所有的视频数据仅在本地进行 AI 分析，不会被存储或上传到云端。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};