import { formatFileSize } from '@clipov/shared';
import { useState } from 'react';

interface VideoCardProps {
  video: {
    id: string;
    name: string;
    fileName: string;
    fileSize: number;
    uploadedAt: Date;
    status: 'uploading' | 'processing' | 'analyzing' | 'analysis_complete' | 'analysis_partial' | 'analysis_failed' | 'failed';
    progress?: number; // For uploading status
    analysisProgress?: number; // For processing status
    currentStep?: string; // Current processing step
    stepDetails?: string; // Detailed step description from backend
    duration?: number; // Video duration in seconds
    resolution?: string; // Video resolution
    thumbnailUrl?: string; // Thumbnail URL
    processingMetadata?: {
      segmentCount?: number;
      successfulSegments?: number;
      failedSegments?: number;
      successRate?: number;
    };
  };
  onRename?: (id: string, newName: string) => void;
  onRetry?: (id: string) => void;
  onPlay?: (id: string) => void;
  onClick?: (id: string) => void;
}

export function VideoCard({ video, onRetry, onPlay, onClick }: VideoCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusInfo = () => {
    switch (video.status) {
      case 'uploading':
        return {
          icon: '📤',
          color: 'bg-blue-500',
          textColor: 'text-blue-600',
          label: 'Uploading',
          progress: video.progress || 0,
          showProgress: true
        };
      case 'processing':
      case 'analyzing':
        return {
          icon: '🔄',
          color: 'bg-purple-500',
          textColor: 'text-purple-600',
          label: video.currentStep || 'Processing',
          progress: video.analysisProgress || 0,
          showProgress: true
        };
      case 'analysis_complete':
        return {
          icon: '✅',
          color: 'bg-green-500',
          textColor: 'text-green-600',
          label: 'Ready',
          progress: 100,
          showProgress: false
        };
      case 'analysis_partial':
        return {
          icon: '⚠️',
          color: 'bg-yellow-500',
          textColor: 'text-yellow-600',
          label: 'Partially Complete',
          progress: 100,
          showProgress: false
        };
      case 'analysis_failed':
      case 'failed':
        return {
          icon: '❌',
          color: 'bg-red-500',
          textColor: 'text-red-600',
          label: 'Failed',
          progress: 0,
          showProgress: false
        };
      default:
        return {
          icon: '⏳',
          color: 'bg-gray-500',
          textColor: 'text-gray-600',
          label: 'Unknown',
          progress: 0,
          showProgress: false
        };
    }
  };

  const statusInfo = getStatusInfo();

  const handleCardClick = () => {
    if (onClick) {
      onClick(video.id);
    } else if (video.status === 'analysis_complete' || video.status === 'analysis_partial') {
      // Default behavior: navigate to edit page for completed videos
      onPlay?.(video.id);
    }
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <div 
      className={`relative bg-white rounded-xl shadow-lg overflow-hidden cursor-pointer transition-all duration-300 transform ${
        isHovered ? 'scale-105 shadow-xl' : 'hover:shadow-lg'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      {/* Thumbnail/Background */}
      <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200">
        {video.thumbnailUrl ? (
          <img 
            src={video.thumbnailUrl} 
            alt={video.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-6xl opacity-30">🎬</div>
          </div>
        )}
        
        {/* Status Overlay - Top Right */}
        <div className="absolute top-3 right-3">
          <div className={`${statusInfo.color} text-white px-2 py-1 rounded-full text-sm font-medium flex items-center space-x-1 shadow-lg`}>
            <span>{statusInfo.icon}</span>
            <span className="hidden sm:inline">{statusInfo.label}</span>
          </div>
        </div>

        {/* Progress Overlay - Bottom */}
        {statusInfo.showProgress && (
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-2">
            <div className="flex justify-between items-center text-white text-xs mb-1">
              <span>{statusInfo.progress}%</span>
              <span className="capitalize">{statusInfo.label}</span>
            </div>
            <div className="w-full bg-gray-300 bg-opacity-30 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  video.status === 'failed' ? 'bg-red-400' : 'bg-white'
                }`}
                style={{ width: `${statusInfo.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Duration Badge - Bottom Left */}
        {video.duration && (
          <div className="absolute bottom-3 left-3">
            <div className="bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs font-medium">
              {formatDuration(video.duration)}
            </div>
          </div>
        )}

        {/* Hover Overlay */}
        {isHovered && (video.status === 'analysis_complete' || video.status === 'analysis_partial') && (
          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
            <div className="text-white text-6xl opacity-80">▶️</div>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-gray-900 text-lg mb-1 truncate">
          {video.name}
        </h3>
        
        {/* Metadata */}
        <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
          <span>{formatFileSize(video.fileSize)}</span>
          {video.resolution && <span>{video.resolution}</span>}
          <span>{formatDate(video.uploadedAt)}</span>
        </div>

        {/* Status Details */}
        {(video.status === 'processing' || video.status === 'analyzing') && (
          <div className="mb-2">
            {video.currentStep && (
              <p className="text-xs text-gray-700 font-medium">
                {video.currentStep}
              </p>
            )}
            {video.stepDetails && (
              <p className="text-xs text-gray-500 mt-1 italic">
                {video.stepDetails}
              </p>
            )}
          </div>
        )}

        {/* Processing Results */}
        {video.processingMetadata && (video.status === 'analysis_complete' || video.status === 'analysis_partial') && (
          <div className="text-xs text-gray-600 mb-2">
            <span>{video.processingMetadata.segmentCount} segments • </span>
            <span className="text-green-600">{video.processingMetadata.successfulSegments} analyzed</span>
            {(video.processingMetadata.failedSegments || 0) > 0 && (
              <span className="text-red-600"> • {video.processingMetadata.failedSegments} failed</span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-3">
          <div className="flex space-x-2">
            {(video.status === 'analysis_complete' || video.status === 'analysis_partial') && (
              <button
                onClick={(e) => handleActionClick(e, () => onPlay?.(video.id))}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors"
              >
                🎬 View
              </button>
            )}
            
            {(video.status === 'failed' || video.status === 'analysis_failed') && (
              <button
                onClick={(e) => handleActionClick(e, () => onRetry?.(video.id))}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm font-medium transition-colors"
              >
                🔄 Retry
              </button>
            )}
          </div>

          {/* Status Indicator */}
          <div className={`flex items-center space-x-1 ${statusInfo.textColor}`}>
            <span className="text-xs font-medium">{statusInfo.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
} 