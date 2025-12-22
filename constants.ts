import { PostureType } from './types';

export const POSTURE_LABELS: Record<PostureType, string> = {
  [PostureType.GOOD]: '端正',
  [PostureType.SLOUCHING]: '弯腰/驼背',
  [PostureType.TOO_CLOSE]: '距离过近',
  [PostureType.TOO_FAR]: '距离过远',
  [PostureType.UNKNOWN]: '未知',
};

export const POSTURE_COLORS: Record<PostureType, string> = {
  [PostureType.GOOD]: 'text-green-600 bg-green-50 border-green-200',
  [PostureType.SLOUCHING]: 'text-orange-600 bg-orange-50 border-orange-200',
  [PostureType.TOO_CLOSE]: 'text-red-600 bg-red-50 border-red-200',
  [PostureType.TOO_FAR]: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  [PostureType.UNKNOWN]: 'text-slate-600 bg-slate-50 border-slate-200',
};