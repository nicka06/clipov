'use client';
import { useAuth } from '@/context/AuthContext';
import { Navbar } from '@/components/ui/Navbar';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { VideoCard } from '@/components/upload/VideoCard';
import { UploadZone } from '@/components/upload/UploadZone';

interface Video {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  status: 'uploading' | 'processing' | 'analyzing' | 'analysis_complete' | 'analysis_partial' | 'analysis_failed' | 'failed';
  progress?: number;
  analysisProgress?: number;
  currentStep?: string;
  stepDetails?: string;
  duration?: number;
  resolution?: string;
  thumbnailUrl?: string;
  processingMetadata?: {
    segmentCount?: number;
    successfulSegments?: number;
    failedSegments?: number;
    successRate?: number;
  };
}

export default function UploadPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showVideoLibrary, setShowVideoLibrary] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin');
    }
  }, [user, loading, router]);

  // Real-time listener for user's videos
  useEffect(() => {
    if (!user) {
      setVideos([]);
      setVideosLoading(false);
      return;
    }

    const videosQuery = query(
      collection(db, 'videos'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(videosQuery, (snapshot) => {
      const videosList: Video[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        videosList.push({
          id: doc.id,
          name: data.name || data.fileName,
          fileName: data.fileName,
          fileSize: data.fileSize,
          uploadedAt: data.uploadedAt?.toDate() || new Date(),
          status: data.status,
          progress: data.progress,
          analysisProgress: data.analysisProgress,
          currentStep: data.currentStep,
          stepDetails: data.stepDetails,
          duration: data.duration,
          resolution: data.resolution,
          thumbnailUrl: data.thumbnailUrl,
          processingMetadata: data.processingMetadata
        });
      });
      
      // Debug: Log real-time updates for active processing videos
      const processingVideos = videosList.filter(v => 
        v.status === 'processing' || v.status === 'analyzing' || v.analysisProgress !== undefined
      );
      if (processingVideos.length > 0) {
        console.log('📊 Real-time backend updates received:', processingVideos.map(v => ({
          name: v.name,
          status: v.status,
          analysisProgress: v.analysisProgress,
          currentStep: v.currentStep,
          duration: v.duration,
          resolution: v.resolution,
          metadata: v.processingMetadata
        })));
        
        // Show notification for completed analysis
        processingVideos.forEach(v => {
          if (v.status === 'analysis_complete') {
            console.log(`🎉 Analysis completed for "${v.name}"! Ready to view.`);
          } else if (v.status === 'analysis_partial') {
            console.log(`⚠️ Analysis partially completed for "${v.name}".`);
          } else if (v.status === 'analysis_failed') {
            console.log(`❌ Analysis failed for "${v.name}".`);
          }
        });
      }
      
      // Sort by upload date (newest first)
      videosList.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
      
      setVideos(videosList);
      setVideosLoading(false);
    }, (error) => {
      console.error('Error fetching videos:', error);
      setVideosLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Upload Center
          </h1>
          <p className="text-gray-600">
            Upload your videos and manage your library
          </p>
        </div>
        
        {/* Upload Zone */}
        <div className="relative mb-8">
          <UploadZone onUploadComplete={(videoId) => {
            console.log('Upload completed:', videoId);
            // Navigate to edit page for the uploaded video
            router.push(`/edit/${videoId}`);
          }} />
          
          {/* Video Library Toggle Button - positioned relative to upload zone */}
          <div className="absolute -bottom-6 right-0">
            <button
              onClick={() => setShowVideoLibrary(!showVideoLibrary)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-full shadow-lg transition-all duration-200 ${
                showVideoLibrary 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className="font-medium">My Videos</span>
              {!videosLoading && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                  {videos.length}
                </span>
              )}
            </button>
          </div>
        </div>
        
        {/* User Info */}
        <div className="text-center text-sm text-gray-600">
          <p>Signed in as: <strong>{user.email}</strong></p>
        </div>
        
        {/* Video Library Popup */}
        {showVideoLibrary && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">My Video Library</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {videos.length} video{videos.length !== 1 ? 's' : ''} total
                  </p>
                </div>
                <button 
                  onClick={() => setShowVideoLibrary(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Content */}
              <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
                {videosLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading videos...</p>
                  </div>
                ) : videos.length === 0 ? (
                  <div className="text-center text-gray-500 py-12">
                    <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p className="text-lg font-medium mb-2">No videos yet</p>
                    <p>Upload your first video to get started!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {videos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        onPlay={(id) => {
                          console.log('Navigate to edit page for video:', id);
                          setShowVideoLibrary(false); // Close the library modal
                          router.push(`/edit/${id}`);
                        }}
                        onRetry={(id) => {
                          console.log('Retry video:', id);
                          // TODO: Implement retry functionality
                        }}
                        onClick={(id) => {
                          console.log('Video card clicked:', id);
                          if (video.status === 'analysis_complete' || video.status === 'analysis_partial') {
                            setShowVideoLibrary(false); // Close the library modal
                            router.push(`/edit/${id}`);
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 