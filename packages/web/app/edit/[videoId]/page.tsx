'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, addDoc, updateDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db, getStorageDownloadURL } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

interface VideoData {
  id: string;
  title?: string;
  fileName?: string;
  name?: string;
  duration: number;
  thumbnail?: string;
  status: string;
  userId: string;
  storageLocation?: string;
}

interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  description: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  videoId: string;
  videoTitle: string;
  clips: Clip[];
  totalDuration: number;
  status: 'draft' | 'exported';
  userId: string;
  createdAt: { toDate?: () => Date } | Date | null;
  updatedAt: { toDate?: () => Date } | Date | null;
}

export default function EditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  
  const videoId = params.videoId as string;
  const projectId = searchParams.get('projectId');
  
  const [video, setVideo] = useState<VideoData | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUrlLoading, setVideoUrlLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load video data
  useEffect(() => {
    if (!user || !videoId) return;

    const loadVideo = async () => {
      try {
        const videoRef = doc(db, 'videos', videoId);
        const videoSnap = await getDoc(videoRef);
        
        if (videoSnap.exists()) {
          const videoData = { id: videoId, ...videoSnap.data() } as VideoData;
          console.log('📹 Loaded video data:', videoData);
          
          // Check if user owns this video
          if (videoData.userId !== user.uid) {
            router.push('/projects');
            return;
          }
          
          setVideo(videoData);
        } else {
          router.push('/projects');
        }
      } catch (error) {
        console.error('Error loading video:', error);
        router.push('/projects');
      }
    };

    loadVideo();
  }, [user, videoId, router]);

  // Generate video URL from storage location
  useEffect(() => {
    if (!video?.storageLocation) return;

    const generateVideoUrl = async () => {
      setVideoUrlLoading(true);
      try {
        const downloadUrl = await getStorageDownloadURL(video.storageLocation!);
        setVideoUrl(downloadUrl);
      } catch (error) {
        console.error('Error generating video URL:', error);
        // Fallback to API endpoint if Firebase Storage fails
        setVideoUrl(`/api/videos/${video.id}/stream`);
      } finally {
        setVideoUrlLoading(false);
      }
    };

    generateVideoUrl();
  }, [video?.storageLocation, video?.id]);

  // Load or create project
  useEffect(() => {
    if (!user || !video) return;

    if (projectId) {
      // Load existing project
      const projectRef = doc(db, 'projects', projectId);
      const unsubscribe = onSnapshot(projectRef, (doc) => {
        if (doc.exists()) {
          const projectData = { id: doc.id, ...doc.data() } as Project;
          setProject(projectData);
        }
        setLoading(false);
      });
      
      return unsubscribe;
    } else {
      // Create new project
      const createProject = async () => {
        try {
          // Use available title fields with fallbacks
          const videoTitle = video.title || video.name || video.fileName || 'Untitled Video';
          
          const newProject = {
            name: `${videoTitle} - Compilation`,
            videoId: video.id,
            videoTitle: videoTitle,
            clips: [],
            totalDuration: 0,
            status: 'draft' as const,
            userId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          const docRef = await addDoc(collection(db, 'projects'), newProject);
          
          // Update URL to include project ID
          router.replace(`/edit/${videoId}?projectId=${docRef.id}`);
          
          setProject({ id: docRef.id, ...newProject } as Project);
        } catch (error) {
          console.error('Error creating project:', error);
        }
        setLoading(false);
      };

      createProject();
    }
  }, [user, video, projectId, router, videoId]);



  const removeClipFromTimeline = async (clipId: string) => {
    if (!project) return;
    
    const updatedClips = project.clips.filter(c => c.id !== clipId);
    const totalDuration = updatedClips.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
    
    try {
      const projectRef = doc(db, 'projects', project.id);
      await updateDoc(projectRef, {
        clips: updatedClips,
        totalDuration,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error removing clip:', error);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!project || !over || active.id === over.id) return;
    
    const oldIndex = project.clips.findIndex(clip => clip.id === active.id);
    const newIndex = project.clips.findIndex(clip => clip.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    const reorderedClips = arrayMove(project.clips, oldIndex, newIndex);
    
    try {
      const projectRef = doc(db, 'projects', project.id);
      await updateDoc(projectRef, {
        clips: reorderedClips,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error reordering clips:', error);
    }
  };

  const trimClip = async (clipId: string, type: 'start' | 'end', direction: 'increase' | 'decrease') => {
    if (!project) return;
    
    const clipIndex = project.clips.findIndex(c => c.id === clipId);
    if (clipIndex === -1) return;
    
    const clip = project.clips[clipIndex];
    let newStartTime = clip.startTime;
    let newEndTime = clip.endTime;
    
    // Apply trimming with basic bounds checking
    if (type === 'start') {
      if (direction === 'increase') {
        newStartTime = Math.min(clip.startTime + 1, clip.endTime - 1);
      } else {
        newStartTime = Math.max(clip.startTime - 1, 0); // Don't go below 0
      }
    } else {
      if (direction === 'increase') {
        // Allow extending up to video duration or reasonable limit
        const maxEnd = video?.duration || clip.endTime + 30;
        newEndTime = Math.min(clip.endTime + 1, maxEnd);
      } else {
        newEndTime = Math.max(clip.endTime - 1, clip.startTime + 1);
      }
    }
    
    // Ensure minimum 1 second duration
    if (newEndTime - newStartTime < 1) return;
    
    const updatedClips = [...project.clips];
    updatedClips[clipIndex] = {
      ...clip,
      startTime: newStartTime,
      endTime: newEndTime
    };
    
    const totalDuration = updatedClips.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
    
    try {
      const projectRef = doc(db, 'projects', project.id);
      await updateDoc(projectRef, {
        clips: updatedClips,
        totalDuration,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error trimming clip:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSearch = async () => {
    console.log('🔍 Search triggered with query:', searchQuery);
    
    if (!searchQuery.trim()) {
      console.log('❌ Empty search query');
      return;
    }
    
    if (!user || !video) {
      console.log('❌ No user or video data available');
      return;
    }
    
    setIsSearching(true);
    
    try {
      console.log('🔍 Calling search API...');
      
      const token = await user.getIdToken();
      const response = await fetch(`/api/search/${videoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ searchQuery })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`🎯 Search completed. Found ${data.total} results:`, data.results);
      
      // Add found clips to timeline
      if (project && data.results.length > 0) {
        console.log(`📝 Adding ${data.results.length} clips to timeline...`);
        
        const newClips: Clip[] = data.results.map((result: { startTime: number; endTime: number; description: string }) => ({
          id: `clip_${Date.now()}_${Math.random()}`,
          startTime: result.startTime,
          endTime: result.endTime,
          description: result.description
        }));
        
        const updatedClips = [...project.clips, ...newClips];
        const totalDuration = updatedClips.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
        
        const projectRef = doc(db, 'projects', project.id);
        await updateDoc(projectRef, {
          clips: updatedClips,
          totalDuration,
          updatedAt: serverTimestamp()
        });
        
        setProject(prev => prev ? { ...prev, clips: updatedClips, totalDuration } : null);
        console.log('✅ All clips added successfully!');
      } else if (data.results.length === 0) {
        console.log('❌ No search results found');
      } else {
        console.log('❌ No project available to add clips to');
      }
      
      setSearchQuery('');
    } catch (error) {
      console.error('Error searching:', error);
      // You could add user-facing error notification here
    } finally {
      setIsSearching(false);
    }
  };



  const playClip = (clipIndex: number) => {
    if (!videoRef || !project || clipIndex >= project.clips.length) return;
    
    const clip = project.clips[clipIndex];
    setCurrentClipIndex(clipIndex);
    
    // Pause and reset any existing playback
    videoRef.pause();
    
    // Set video to start time of the clip
    videoRef.currentTime = clip.startTime;
    
    // Set up event listener to stop at end time
    const handleTimeUpdate = () => {
      if (videoRef && videoRef.currentTime >= clip.endTime) {
        videoRef.pause();
        videoRef.removeEventListener('timeupdate', handleTimeUpdate);
        
        // Auto-play next clip if exists
        if (clipIndex + 1 < project.clips.length) {
          setTimeout(() => playClip(clipIndex + 1), 500);
        }
      }
    };
    
    // Remove any existing listeners first
    videoRef.removeEventListener('timeupdate', handleTimeUpdate);
    videoRef.addEventListener('timeupdate', handleTimeUpdate);
    
    // Start playing after a small delay to ensure everything is set up
    setTimeout(() => {
      if (videoRef) {
        videoRef.play().catch(error => {
          console.log('Play interrupted:', error);
          // Ignore play interruption errors
        });
      }
    }, 100);
  };

  const playFullCompilation = () => {
    if (!project || project.clips.length === 0) return;
    playClip(0);
  };

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.target as HTMLVideoElement;
    const currentTime = video.currentTime;
    
    // Update which clip we're currently viewing
    if (project?.clips) {
      for (let i = 0; i < project.clips.length; i++) {
        const clip = project.clips[i];
        if (currentTime >= clip.startTime && currentTime <= clip.endTime) {
          setCurrentClipIndex(i);
          break;
        }
      }
    }
    
    setCurrentPreviewTime(currentTime);
  };

  // Sortable clip item component - simplified video editing style
  const SortableClipItem = ({ clip, index }: { clip: Clip; index: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: clip.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const clipDuration = clip.endTime - clip.startTime;
    const clipWidth = Math.max(120, clipDuration * 20); // Minimum 120px, scale with duration

    return (
      <div 
        ref={setNodeRef}
        style={{ ...style, width: `${clipWidth}px` }}
        className={`relative bg-blue-600 hover:bg-blue-500 rounded border border-blue-400 cursor-grab active:cursor-grabbing ${
          isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''
        }`}
        {...attributes}
        {...listeners}
        title={`${clip.description} (${formatTime(clipDuration)})`}
      >
        {/* Clip main body */}
        <div className="px-3 py-2 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Clip {index + 1}</span>
            <span className="text-xs opacity-75">{formatTime(clipDuration)}</span>
          </div>
          <div className="text-xs opacity-90 truncate mt-1" style={{ maxWidth: `${clipWidth - 24}px` }}>
            {clip.description}
          </div>
          <div className="text-xs opacity-75 mt-1">
            {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
          </div>
        </div>

        {/* Control buttons - shown on hover */}
        <div className="absolute -top-6 left-0 right-0 flex justify-center space-x-1 opacity-0 hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              playClip(index);
            }}
            className="bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded text-xs"
            title="Preview clip"
          >
            ▶
          </button>
          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              removeClipFromTimeline(clip.id); 
            }}
            className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs"
            title="Remove clip"
          >
            ×
          </button>
        </div>

        {/* Trim handles */}
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-800 hover:bg-blue-700 cursor-ew-resize rounded-l"
             title="Drag to trim start"
             onClick={(e) => { e.stopPropagation(); trimClip(clip.id, 'start', 'decrease'); }}
        />
        <div className="absolute right-0 top-0 bottom-0 w-2 bg-blue-800 hover:bg-blue-700 cursor-ew-resize rounded-r"
             title="Drag to trim end"
             onClick={(e) => { e.stopPropagation(); trimClip(clip.id, 'end', 'increase'); }}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!video || !project) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Video or project not found.</p>
          <Link href="/projects">
            <Button className="mt-4">Back to Projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Top Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/projects">
            <Button variant="secondary" className="text-sm">← Back</Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-white">{project.name}</h1>
            <p className="text-sm text-gray-400">{video.title || video.name || video.fileName || 'Untitled Video'}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-400">
            {formatTime(project.totalDuration)}
          </span>
          <Button variant="secondary" className="text-sm">Save</Button>
          <Button className="text-sm">Export</Button>
        </div>
      </div>

      {/* Main Presenter Area */}
      <div className="flex-1 flex items-center justify-center bg-black p-8">
        <div className="w-full max-w-6xl">
          <div className="aspect-video bg-black rounded-lg relative overflow-hidden">
            {project.clips && project.clips.length > 0 ? (
              <div className="w-full h-full">
                {videoUrlLoading ? (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                      <p className="mt-2 text-gray-400 text-sm">Loading video...</p>
                    </div>
                  </div>
                ) : videoUrl ? (
                  <video
                    ref={setVideoRef}
                    className="w-full h-full object-contain"
                    controls
                    onTimeUpdate={handleVideoTimeUpdate}
                  >
                    <source src={videoUrl} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <p className="text-gray-400">Failed to load video</p>
                  </div>
                )}

                {/* Play compilation button */}
                <div className="absolute top-4 right-4">
                  <button
                    onClick={playFullCompilation}
                    className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 text-sm"
                    title="Play full compilation"
                  >
                    ▶ Play All
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-2xl text-center">
                  <svg className="w-16 h-16 mb-6 mx-auto text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-2xl font-semibold text-white mb-4">Create Your First Clip</h3>
                  <p className="text-gray-400 mb-8">Describe what you&apos;re looking for and we&apos;ll find the perfect moments from your video.</p>
                  
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Describe what you&apos;re looking for..."
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onKeyPress={(e) => e.key === 'Enter' && !isSearching && handleSearch()}
                    />
                    <button 
                      onClick={handleSearch}
                      disabled={isSearching || !searchQuery.trim()}
                      className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                      {isSearching ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Searching...</span>
                        </div>
                      ) : (
                        '🔍 Find Clips'
                      )}
                    </button>
                  </div>
                  
                  <div className="mt-8 text-sm text-gray-500">
                    <p>Example: &quot;funny moments&quot;, &quot;action scenes&quot;, &quot;when someone laughs&quot;</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Timeline Section */}
          <div className="mt-6 bg-gray-800 border border-gray-700 rounded-lg p-4" style={{ minHeight: '200px', maxHeight: '300px' }}>
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-white">Timeline</h3>
                <div className="text-sm text-gray-400">
                  {project.clips.length} clips • {formatTime(project.totalDuration)}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {project.clips.length > 0 ? (
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext 
                      items={project.clips.map(clip => clip.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-wrap gap-2 min-h-[60px] p-2 bg-gray-900 rounded border-2 border-dashed border-gray-600">
                        {project.clips.map((clip, index) => (
                          <SortableClipItem 
                            key={clip.id} 
                            clip={clip} 
                            index={index}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                      <svg className="w-12 h-12 mb-2 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p>No clips in timeline</p>
                      <p className="text-sm">Add clips to start editing</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>


    </div>
  );
} 