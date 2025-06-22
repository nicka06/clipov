export interface User {
  uid: string;
  email: string | null;
  authProvider: 'google' | 'email';
  createdAt: Date;
  lastLoginAt: Date;
}

export interface Video {
  videoId: string;
  userId: string;
  fileName: string;
  displayName: string;
  fileSize: number;
  uploadedAt: Date;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  storageLocation?: string;
}

export interface UploadSession {
  uploadId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  status: 'initializing' | 'uploading' | 'processing' | 'completed' | 'failed';
  chunksCompleted: number[];
  chunksFailed: number[];
  totalChunks: number;
  chunkSize: number;
  createdAt: Date;
  lastUpdated: Date;
} 