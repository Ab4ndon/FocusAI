import React from 'react';
import { AnalysisResult } from '../types';
import { ExclamationTriangleIcon, DevicePhoneMobileIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

interface AlertPanelProps {
  result: AnalysisResult | null;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({ result }) => {
  if (!result) return null;

  const { hasElectronicDevice, detectedDistractions } = result;
  const hasDistractions = detectedDistractions.length > 0;

  if (!hasElectronicDevice && !hasDistractions) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h4 className="text-green-800 font-medium text-sm">状态良好</h4>
          <p className="text-green-600 text-xs">未检测到明显干扰源</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasElectronicDevice && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-3">
          <DevicePhoneMobileIcon className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <h4 className="text-red-800 font-bold text-sm">检测到电子设备</h4>
            <p className="text-red-600 text-xs">请收起手机或其他电子产品，保持专注。</p>
          </div>
        </div>
      )}

      {detectedDistractions.map((distraction, idx) => (
        <div key={idx} className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-orange-500 mt-0.5" />
          <div>
            <h4 className="text-orange-800 font-bold text-sm">注意力分散警报</h4>
            <p className="text-orange-700 text-xs">{distraction}</p>
          </div>
        </div>
      ))}
    </div>
  );
};