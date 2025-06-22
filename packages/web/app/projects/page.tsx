'use client';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  description?: string;
  videoId: string;
  videoTitle: string;
  videoThumbnail?: string;
  clips: Array<{
    id: string;
    startTime: number;
    endTime: number;
    description: string;
  }>;
  totalDuration: number;
  createdAt: { toDate?: () => Date } | Date | null;
  updatedAt: { toDate?: () => Date } | Date | null;
  status: 'draft' | 'exported';
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [userVideos, setUserVideos] = useState<Array<{
    id: string;
    title: string;
    duration: number;
    thumbnail?: string;
    status: string;
  }>>([]);

  // Fetch user's projects
  useEffect(() => {
    if (!user) {
      router.push('/auth/signin');
      return;
    }

    const projectsQuery = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(projectsQuery, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Project[];
      
      setProjects(projectsData);
      setLoading(false);
    }, (error: Error) => {
      console.error('Error fetching projects:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, router]);

  // Fetch user's uploaded videos for "Create New Project" section
  useEffect(() => {
    if (!user) return;

    const fetchUserVideos = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const videoIds = userData.videos || [];
          
          // Fetch video documents
          const videoPromises = videoIds.map(async (videoId: string) => {
            const videoRef = doc(db, 'videos', videoId);
            const videoSnap = await getDoc(videoRef);
            return videoSnap.exists() ? { id: videoId, ...videoSnap.data() } : null;
          });
          
          const videos = (await Promise.all(videoPromises)).filter(Boolean);
          setUserVideos(videos.filter(video => video.status === 'completed'));
        }
      } catch (error) {
        console.error('Error fetching user videos:', error);
      }
    };

    fetchUserVideos();
  }, [user]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: { toDate?: () => Date } | Date | null) => {
    if (!timestamp) return '';
    const date = typeof timestamp === 'object' && 'toDate' in timestamp && timestamp.toDate 
      ? timestamp.toDate() 
      : timestamp instanceof Date 
        ? timestamp 
        : new Date();
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Your Projects</h1>
            <p className="mt-2 text-gray-600">
              Create and manage your video compilation projects
            </p>
          </div>
        </div>

        {/* Create New Project Section */}
        {userVideos.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Create New Project
            </h2>
            <p className="text-gray-600 mb-4">
              Select a video to start creating a new compilation project:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userVideos.map((video) => (
                <div 
                  key={video.id}
                  className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/edit/${video.id}`)}
                >
                  {video.thumbnail && (
                    <img 
                      src={video.thumbnail} 
                      alt={video.title}
                      className="w-full h-32 object-cover"
                    />
                  )}
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 truncate">
                      {video.title || 'Untitled Video'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {formatDuration(video.duration || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects List */}
        {projects.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Recent Projects ({projects.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-200">
              {projects.map((project) => (
                <div key={project.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-medium text-gray-900">
                          {project.name}
                        </h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          project.status === 'exported' 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {project.status === 'exported' ? 'Exported' : 'Draft'}
                        </span>
                      </div>
                      
                      {project.description && (
                        <p className="mt-1 text-sm text-gray-600">
                          {project.description}
                        </p>
                      )}
                      
                      <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                        <span>Video: {project.videoTitle}</span>
                        <span>•</span>
                        <span>{project.clips.length} clips</span>
                        <span>•</span>
                        <span>Duration: {formatDuration(project.totalDuration)}</span>
                        <span>•</span>
                        <span>Updated {formatDate(project.updatedAt)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <Link href={`/edit/${project.videoId}?projectId=${project.id}`}>
                        <Button variant="secondary" className="text-sm">
                          Continue Editing
                        </Button>
                      </Link>
                      {project.status === 'exported' && (
                        <Button className="text-sm">
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              No projects yet
            </h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              {userVideos.length > 0 
                ? "Select a video above to create your first compilation project."
                : "Upload and analyze a video first, then come back here to create compilation projects."
              }
            </p>
            {userVideos.length === 0 && (
              <Link href="/upload">
                <Button>Upload Your First Video</Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 