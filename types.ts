export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  data: string; // Base64
}

export enum ProcessingState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  READY = 'READY',
  ERROR = 'ERROR'
}

export interface DocumentStats {
  pageCount?: number; // Estimated
  summary?: string;
  keyTopics?: string[];
  sentiment?: string;
  suggestedQuestions?: string[];
}