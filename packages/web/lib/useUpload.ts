import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UploadApiClient, uploadChunk } from '@clipov/shared';
import { SUPPORTED_VIDEO_TYPES, MAX_FILE_SIZE, MIN_FILE_SIZE } from '@clipov/shared';

interface UploadProgress {
  uploadSessionId: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'uploading' | 'finalizing' | 'analyzing' | 'completed' | 'failed' | 'paused';
  uploadSpeed: number; // bytes per second
  timeRemaining: number; // seconds
  error?: string;
  videoId?: string; // Add videoId for analysis tracking
  analysisProgress?: number; // Analysis progress (0-100)
}

interface UseUploadReturn {
  uploads: UploadProgress[];
  uploadFile: (file: File) => Promise<void>;
  pauseUpload: (uploadSessionId: string) => void;
  resumeUpload: (uploadSessionId: string) => Promise<void>;
  cancelUpload: (uploadSessionId: string) => void;
  isUploading: boolean;
}

export function useUpload(): UseUploadReturn {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  
  // Create API client with auth token (memoized to prevent recreation on every render)
  const apiClient = useMemo(() => new UploadApiClient(
    window.location.origin,
    async () => {
      if (!user) throw new Error('User not authenticated');
      return await user.getIdToken();
    }
  ), [user]);

  const validateFile = (file: File): string | null => {
    if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
      return `Unsupported file type: ${file.type}. Please upload a video file.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large: ${(file.size / (1024 * 1024 * 1024)).toFixed(1)}GB. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB.`;
    }
    if (file.size < MIN_FILE_SIZE) {
      return `File too small: ${file.size} bytes. Minimum size is ${MIN_FILE_SIZE} bytes.`;
    }
    return null;
  };

  const pollAnalysisProgress = useCallback(async (uploadSessionId: string, videoId: string) => {
    const pollInterval = 2000; // Poll every 2 seconds
    const maxPollTime = 30 * 60 * 1000; // Max 30 minutes
    const startTime = Date.now();

    const poll = async (): Promise<void> => {
      try {
        if (!user) {
          console.error('User not authenticated for polling');
          return;
        }

        const token = await user.getIdToken();
        const response = await fetch(`${window.location.origin}/api/analysis/status?videoId=${videoId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Update the upload progress with analysis data
        setUploads(prev => prev.map(upload => 
          upload.uploadSessionId === uploadSessionId
            ? { 
                ...upload, 
                analysisProgress: data.progress || 0,
                status: data.status === 'analysis_complete' ? 'completed' : 
                       data.status === 'analysis_failed' ? 'failed' : 'analyzing',
                error: data.error || upload.error
              }
            : upload
        ));

        // Stop polling if analysis is complete or failed
        if (data.status === 'analysis_complete' || data.status === 'analysis_failed') {
          console.log(`Analysis ${data.status} for video ${videoId}`);
          return;
        }

        // Stop polling if max time reached
        if (Date.now() - startTime > maxPollTime) {
          console.error('Analysis polling timeout reached');
          setUploads(prev => prev.map(upload => 
            upload.uploadSessionId === uploadSessionId
              ? { ...upload, status: 'failed', error: 'Analysis polling timeout' }
              : upload
          ));
          return;
        }

        // Continue polling
        setTimeout(poll, pollInterval);
        
      } catch (error) {
        console.error('Analysis polling error:', error);
        
        // Stop polling on error after a few retries
        if (Date.now() - startTime > 10000) { // Stop after 10 seconds of errors
          setUploads(prev => prev.map(upload => 
            upload.uploadSessionId === uploadSessionId
              ? { 
                  ...upload, 
                  status: 'failed', 
                  error: `Analysis polling failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
                }
              : upload
          ));
          return;
        }

        // Retry in 5 seconds on error
        setTimeout(poll, 5000);
      }
    };

    // Start polling
    poll();
  }, [user]);

  const uploadFile = useCallback(async (file: File) => {
    console.log('🔄 Starting upload for file:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    if (!user) {
      console.error('❌ User not authenticated');
      throw new Error('User not authenticated');
    }
    console.log('✅ User authenticated:', user.uid);

    // Validate file
    const validationError = validateFile(file);
    if (validationError) {
      console.error('❌ File validation failed:', validationError);
      throw new Error(validationError);
    }
    console.log('✅ File validation passed');

    try {
      // Step 1: Initiate upload
      console.log('🚀 Calling apiClient.initiateUpload...');
      const initiateResponse = await apiClient.initiateUpload({
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });
      
      console.log('📥 Initiate upload response:', initiateResponse);

      if (!initiateResponse.success || !initiateResponse.data?.uploadSessionId) {
        console.error('❌ Initiate upload failed:', initiateResponse.error);
        throw new Error(initiateResponse.error || 'Failed to initiate upload');
      }
      console.log('✅ Upload initiated successfully, session ID:', initiateResponse.data.uploadSessionId);

      const { uploadSessionId, totalChunks, chunkSize, chunkUrls } = initiateResponse.data;
      
      // Add to uploads state
      const uploadProgress: UploadProgress = {
        uploadSessionId,
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        status: 'uploading',
        uploadSpeed: 0,
        timeRemaining: 0,
      };

      setUploads(prev => [...prev, uploadProgress]);

      // Step 2: Upload chunks in parallel
      const uploadStartTime = Date.now();
      let completedChunks = 0;
      const concurrentLimit = Math.min(3, totalChunks!); // Reduce concurrent limit to avoid overwhelming the API
      const chunkResults = new Array(totalChunks!).fill(false); // Track which chunks completed

      const uploadChunkWithProgress = async (chunkIndex: number): Promise<void> => {
        const start = chunkIndex * chunkSize!;
        const end = Math.min(start + chunkSize!, file.size);
        const chunkData = file.slice(start, end);
        
        try {
          // Upload the chunk to Cloud Storage
          await uploadChunk(chunkUrls![chunkIndex], chunkData, () => {
            // Individual chunk progress (not used for overall progress)
          });

          // Report progress to server - CRITICAL: Do this immediately after successful upload
          await apiClient.updateProgress({
            sessionId: uploadSessionId,
            chunkIndex,
            status: 'completed',
            uploadSpeed: 0, // We'll calculate this separately
          });

          // Mark this chunk as completed
          chunkResults[chunkIndex] = true;
          completedChunks++;
          
          // Calculate upload speed and time remaining
          const elapsedTime = (Date.now() - uploadStartTime) / 1000;
          const uploadedBytes = completedChunks * chunkSize!;
          const uploadSpeed = uploadedBytes / elapsedTime;
          const remainingBytes = file.size - uploadedBytes;
          const timeRemaining = remainingBytes / uploadSpeed;

          // Update UI progress
          const progress = Math.round((completedChunks / totalChunks!) * 100);
          setUploads(prev => prev.map(upload => 
            upload.uploadSessionId === uploadSessionId
              ? { ...upload, progress, uploadSpeed, timeRemaining }
              : upload
          ));

          console.log(`✅ Chunk ${chunkIndex} completed successfully (${completedChunks}/${totalChunks!})`);
          
        } catch (error) {
          console.error(`❌ Chunk ${chunkIndex} failed:`, error);
          // Report failure to server
          try {
            await apiClient.updateProgress({
              sessionId: uploadSessionId,
              chunkIndex,
              status: 'failed',
              uploadSpeed: 0,
            });
          } catch (reportError) {
            console.error(`Failed to report chunk ${chunkIndex} failure:`, reportError);
          }
          throw error;
        }
      };

      // Upload chunks in batches with proper error handling
      const uploadPromises: Promise<void>[] = [];
      for (let i = 0; i < totalChunks!; i++) {
        uploadPromises.push(uploadChunkWithProgress(i));
      }

      // Execute uploads with concurrency control
      const executeWithConcurrency = async (promises: Promise<void>[], limit: number) => {
        for (let i = 0; i < promises.length; i += limit) {
          const batch = promises.slice(i, i + limit);
          try {
            await Promise.all(batch);
          } catch (error) {
            console.error(`Batch ${Math.floor(i / limit)} failed:`, error);
            // Continue with other batches, individual chunks will handle their own errors
          }
        }
      };

      await executeWithConcurrency(uploadPromises, concurrentLimit);

      // Verify all chunks completed before finalizing
      const actualCompletedChunks = chunkResults.filter(completed => completed).length;
      console.log(`📊 Upload summary: ${actualCompletedChunks}/${totalChunks!} chunks completed`);
      
      if (actualCompletedChunks !== totalChunks!) {
        throw new Error(`Upload incomplete: only ${actualCompletedChunks} of ${totalChunks!} chunks completed successfully`);
      }

      // Step 3: Finalize upload
      setUploads(prev => prev.map(upload => 
        upload.uploadSessionId === uploadSessionId
          ? { ...upload, status: 'finalizing', progress: 100 }
          : upload
      ));

      const finalizeResponse = await apiClient.finalizeUpload({
        sessionId: uploadSessionId,
      });

      if (!finalizeResponse.success) {
        throw new Error(finalizeResponse.error || 'Failed to finalize upload');
      }

      // Extract videoId from response and start analysis tracking
      const videoId = finalizeResponse.videoId;
      if (videoId) {
        // Mark as analyzing and start polling
        setUploads(prev => prev.map(upload => 
          upload.uploadSessionId === uploadSessionId
            ? { ...upload, status: 'analyzing', videoId, analysisProgress: 0 }
            : upload
        ));

        // Start polling for analysis progress
        pollAnalysisProgress(uploadSessionId, videoId);
      } else {
        // No videoId means analysis won't start, mark as completed
        setUploads(prev => prev.map(upload => 
          upload.uploadSessionId === uploadSessionId
            ? { ...upload, status: 'completed' }
            : upload
        ));
      }

    } catch (error) {
      console.error('Upload error:', error);
      // Find the upload by file name since uploadSessionId might not be available
      setUploads(prev => prev.map(upload => 
        upload.fileName === file.name && upload.status === 'uploading'
          ? { 
              ...upload, 
              status: 'failed', 
              error: error instanceof Error ? error.message : 'Upload failed' 
            }
          : upload
      ));
      throw error;
    }
  }, [user, apiClient, pollAnalysisProgress]);

  const pauseUpload = useCallback((uploadSessionId: string) => {
    setUploads(prev => prev.map(upload => 
      upload.uploadSessionId === uploadSessionId
        ? { ...upload, status: 'paused' }
        : upload
    ));
  }, []);

  const resumeUpload = useCallback(async (uploadSessionId: string) => {
    try {
      const resumeResponse = await apiClient.resumeUpload({
        sessionId: uploadSessionId,
      });

      if (!resumeResponse.success) {
        throw new Error(resumeResponse.error || 'Failed to resume upload');
      }

      setUploads(prev => prev.map(upload => 
        upload.uploadSessionId === uploadSessionId
          ? { ...upload, status: 'uploading', error: undefined }
          : upload
      ));

      // TODO: Implement actual resume logic with missing chunks
      // This would require storing the original file reference
      
    } catch (error) {
      console.error('Resume error:', error);
      setUploads(prev => prev.map(upload => 
        upload.uploadSessionId === uploadSessionId
          ? { 
              ...upload, 
              status: 'failed',
              error: error instanceof Error ? error.message : 'Resume failed' 
            }
          : upload
      ));
    }
  }, [apiClient]);

  const cancelUpload = useCallback((uploadSessionId: string) => {
    setUploads(prev => prev.filter(upload => upload.uploadSessionId !== uploadSessionId));
  }, []);

  const isUploading = uploads.some(upload => 
    upload.status === 'uploading' || upload.status === 'finalizing'
  );

  return {
    uploads,
    uploadFile,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    isUploading,
  };
} 