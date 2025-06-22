import { formatFileSize } from '@shared/utils/upload';

interface VideoCardProps {
  video: {
    id: string;
    name: string;
    fileName: string;
    fileSize: number;
    uploadedAt: Date;
    status: 'uploading' | 'processing' | 'completed' | 'failed';
    progress?: number; // For uploading status
  };
  onRename?: (id: string, newName: string) => void;
  onRetry?: (id: string) => void;
  onPlay?: (id: string) => void;
}

export function VideoCard({ video, onRename, onRetry, onPlay }: VideoCardProps) {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = () => {
    switch (video.status) {
      case 'uploading':
        return (
          <div className="relative w-8 h-8">
            <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {video.progress && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-medium text-blue-600">{video.progress}%</span>
              </div>
            )}
          </div>
        );
      case 'processing':
        return (
          <svg className="w-8 h-8 text-yellow-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          </svg>
        );
      case 'completed':
        return (
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        );
      case 'failed':
        return (
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
        );
    }
  };

  const getActionButton = () => {
    switch (video.status) {
      case 'completed':
        return (
          <button
            onClick={() => onPlay?.(video.id)}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
          >
            Play
          </button>
        );
      case 'failed':
        return (
          <button
            onClick={() => onRetry?.(video.id)}
            className="text-red-600 hover:text-red-800 font-medium text-sm"
          >
            Retry
          </button>
        );
      case 'uploading':
        return (
          <span className="text-blue-600 font-medium text-sm">
            {video.progress}% uploaded
          </span>
        );
      case 'processing':
        return (
          <span className="text-yellow-600 font-medium text-sm">
            Processing...
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start space-x-4">
        {/* Status Icon */}
        <div className="flex-shrink-0 mt-1">
          {getStatusIcon()}
        </div>
        
        {/* Video Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900 truncate">
                {video.name}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {video.fileName} • {formatFileSize(video.fileSize)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {formatDate(video.uploadedAt)}
              </p>
            </div>
            
            {/* Action Button */}
            <div className="ml-4 flex-shrink-0">
              {getActionButton()}
            </div>
          </div>
          
          {/* Progress Bar for Uploading */}
          {video.status === 'uploading' && video.progress && (
            <div className="mt-3">
              <div className="bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${video.progress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 