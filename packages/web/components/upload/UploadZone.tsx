import React, { useCallback, useState } from 'react';
import { useUpload } from '@/lib/useUpload';
import { formatFileSize } from '@clipov/shared';

interface UploadZoneProps {
  onUploadComplete?: (videoId: string) => void;
}

export function UploadZone({ }: UploadZoneProps) {
  const { uploads, uploadFile, pauseUpload, resumeUpload, cancelUpload, isUploading } = useUpload();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelection = useCallback(async (files: File[]) => {
    setError(null);
    
    for (const file of files) {
      try {
        await uploadFile(file);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Upload failed');
        break; // Stop uploading more files if one fails
      }
    }
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFileSelection(files);
  }, [handleFileSelection]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFileSelection(files);
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  }, [handleFileSelection]);

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatUploadSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond < 1024 * 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        className={`relative bg-white p-12 rounded-xl shadow-sm border-2 border-dashed transition-all duration-200 ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400'
        } ${isUploading ? 'opacity-75' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="video/*"
          multiple
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading}
        />
        
        <div className="text-center">
          <svg 
            className={`mx-auto h-16 w-16 mb-4 transition-colors ${
              isDragOver ? 'text-blue-500' : 'text-gray-400'
            }`} 
            stroke="currentColor" 
            fill="none" 
            viewBox="0 0 48 48"
          >
            <path 
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" 
              strokeWidth={2} 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {isDragOver ? 'Drop your videos here' : 'Drop your videos here'}
          </h3>
          <p className="text-gray-500 mb-4">
            or click to browse your files
          </p>
          <p className="text-sm text-gray-400">
            Supports MP4, MOV, AVI, WebM • Max 5GB per file
          </p>
        </div>
        
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-xl">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Processing uploads...</p>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Upload Progress List */}
      {uploads.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-gray-900">Active Uploads</h3>
          {uploads.map((upload) => (
            <div key={upload.uploadSessionId} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {upload.fileName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(upload.fileSize)}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {upload.status === 'uploading' && (
                    <button
                      onClick={() => pauseUpload(upload.uploadSessionId)}
                      className="text-gray-400 hover:text-gray-600"
                      title="Pause upload"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                  {upload.status === 'paused' && (
                    <button
                      onClick={() => resumeUpload(upload.uploadSessionId)}
                      className="text-blue-600 hover:text-blue-700"
                      title="Resume upload"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => cancelUpload(upload.uploadSessionId)}
                    className="text-red-400 hover:text-red-600"
                    title="Cancel upload"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>
                    {upload.status === 'analyzing' 
                      ? `Analysis: ${upload.analysisProgress || 0}%` 
                      : `${upload.progress}%`}
                  </span>
                  <span className="capitalize">
                    {upload.status === 'analyzing' ? 'Analyzing Video' : upload.status}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      upload.status === 'failed' 
                        ? 'bg-red-500' 
                        : upload.status === 'completed'
                        ? 'bg-green-500'
                        : upload.status === 'analyzing'
                        ? 'bg-purple-600'
                        : 'bg-blue-600'
                    }`}
                    style={{ 
                      width: `${upload.status === 'analyzing' 
                        ? upload.analysisProgress || 0 
                        : upload.progress}%` 
                    }}
                  />
                </div>
              </div>

              {/* Upload Stats */}
              {upload.status === 'uploading' && upload.uploadSpeed > 0 && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatUploadSpeed(upload.uploadSpeed)}</span>
                  <span>{formatTimeRemaining(upload.timeRemaining)} remaining</span>
                </div>
              )}

              {/* Analysis Status */}
              {upload.status === 'analyzing' && (
                <div className="flex items-center text-xs text-purple-600 mt-1">
                  <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>AI is analyzing your video...</span>
                </div>
              )}

              {/* Completion Status */}
              {upload.status === 'completed' && (
                <div className="flex items-center text-xs text-green-600 mt-1">
                  <svg className="h-3 w-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Upload and analysis complete!</span>
                </div>
              )}

              {/* Error Message */}
              {upload.error && (
                <div className="mt-2 text-sm text-red-600">
                  {upload.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 