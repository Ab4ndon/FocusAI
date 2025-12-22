export enum PostureType {
  GOOD = 'GOOD',
  SLOUCHING = 'SLOUCHING',
  TOO_CLOSE = 'TOO_CLOSE',
  TOO_FAR = 'TOO_FAR',
  UNKNOWN = 'UNKNOWN'
}

export enum AttentionLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export interface AnalysisResult {
  timestamp: number;
  concentrationScore: number; // 0-100
  isLookingAtScreen: boolean;
  posture: PostureType;
  hasElectronicDevice: boolean;
  detectedDistractions: string[]; // e.g., ["Phone", "Talking", "Looking Away"]
  feedback: string;
}

export interface MonitorState {
  isMonitoring: boolean;
  history: AnalysisResult[];
}

export interface SessionSummary {
  averageScore: number;
  totalDurationSeconds: number;
  distractionCount: number;
  postureStats: Record<PostureType, number>;
  aiComment: string;
}