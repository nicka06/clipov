interface InitiateUploadRequest {
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface InitiateUploadResponse {
  success: boolean;
  data?: {
    uploadSessionId: string;
    totalChunks: number;
    chunkSize: number;
    chunkUrls: string[];
    expiresAt: number;
  };
  error?: string;
}

interface UpdateProgressRequest {
  sessionId: string;
  chunkIndex: number;
  status: 'completed' | 'failed';
  uploadSpeed?: number;
}

interface UpdateProgressResponse {
  success: boolean;
  completedChunks?: number[];
  progress?: number;
  uploadSpeed?: number;
  timeRemaining?: number;
  error?: string;
}

interface FinalizeUploadRequest {
  sessionId: string;
}

interface FinalizeUploadResponse {
  success: boolean;
  videoId?: string;
  status?: 'completed';
  error?: string;
}

interface ResumeUploadRequest {
  sessionId: string;
}

interface ResumeUploadResponse {
  success: boolean;
  uploadSessionId?: string;
  totalChunks?: number;
  existingChunks?: number[];
  missingChunks?: number[];
  chunkUrls?: { [key: number]: string };
  progress?: number;
  status?: 'resuming' | 'ready_to_finalize';
  error?: string;
}

// Base API client class that can be extended for different platforms
export class UploadApiClient {
  private baseUrl: string;
  private getAuthToken: () => Promise<string>;

  constructor(baseUrl: string, getAuthToken: () => Promise<string>) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
  }

  private async makeRequest<T>(endpoint: string, data: any): Promise<T> {
    console.log(`🌐 API Client: Making request to ${endpoint}`, data);
    
    const token = await this.getAuthToken();
    console.log('🔑 API Client: Got auth token, length:', token.length);
    
    const url = `${this.baseUrl}/api/upload/${endpoint}`;
    console.log('📡 API Client: Requesting URL:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    console.log('📥 API Client: Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Client: Request failed:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json() as T;
    console.log('✅ API Client: Response data:', result);
    return result;
  }

  async initiateUpload(request: InitiateUploadRequest): Promise<InitiateUploadResponse> {
    return this.makeRequest<InitiateUploadResponse>('initiate', request);
  }

  async updateProgress(request: UpdateProgressRequest): Promise<UpdateProgressResponse> {
    return this.makeRequest<UpdateProgressResponse>('progress', request);
  }

  async finalizeUpload(request: FinalizeUploadRequest): Promise<FinalizeUploadResponse> {
    return this.makeRequest<FinalizeUploadResponse>('finalize', request);
  }

  async resumeUpload(request: ResumeUploadRequest): Promise<ResumeUploadResponse> {
    return this.makeRequest<ResumeUploadResponse>('resume', request);
  }
}

// Utility function to upload a chunk to a signed URL
export async function uploadChunk(
  signedUrl: string,
  chunkData: Blob | ArrayBuffer,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if we're in a browser environment
    if (typeof XMLHttpRequest === 'undefined') {
      reject(new Error('uploadChunk can only be used in browser environments'));
      return;
    }
    
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event: ProgressEvent) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'));
    });

    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.send(chunkData);
  });
}

// Export types for use in client applications
export type {
  InitiateUploadRequest,
  InitiateUploadResponse,
  UpdateProgressRequest,
  UpdateProgressResponse,
  FinalizeUploadRequest,
  FinalizeUploadResponse,
  ResumeUploadRequest,
  ResumeUploadResponse,
}; 