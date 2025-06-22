import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest, context: { params: Promise<{ videoId: string }> }) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Verify Firebase ID token
    const token = authHeader.split(' ')[1];
    const decodedToken = await verifyIdToken(token);
    const userId = decodedToken.uid;

    const params = await context.params;
    const { videoId } = params;
    const { searchQuery } = await request.json();

    if (!searchQuery || !searchQuery.trim()) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Searching video ${videoId} for: "${searchQuery}"`);

    // Verify user owns the video
    const videoDoc = await adminDb.collection('videos').doc(videoId).get();
    if (!videoDoc.exists) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    const videoData = videoDoc.data();
    if (videoData?.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized access to video' },
        { status: 403 }
      );
    }

    // Search through segments
    const segmentsSnapshot = await adminDb
      .collection('videos')
      .doc(videoId)
      .collection('segments')
      .get();

    const results: Array<{
      type: string;
      id: string;
      startTime: number;
      endTime: number;
      description: string;
      source: string;
    }> = [];

    const searchLower = searchQuery.toLowerCase();

    segmentsSnapshot.forEach(doc => {
      const segment = doc.data();
      const segmentId = doc.id;

      // Search in searchableText (combined content)
      if (segment.searchableText?.toLowerCase().includes(searchLower)) {
        results.push({
          type: 'scene',
          id: `scene_${segmentId}`,
          startTime: segment.startTime || 0,
          endTime: segment.endTime || 30,
          description: segment.searchableText,
          source: 'Visual Scene'
        });
      }

      // Search in audio transcript
      if (segment.audio?.transcript?.toLowerCase().includes(searchLower)) {
        results.push({
          type: 'audio',
          id: `audio_${segmentId}`,
          startTime: segment.startTime || 0,
          endTime: segment.endTime || 30,
          description: segment.audio.transcript,
          source: 'Audio Transcription'
        });
      }

      // Search in objects
      if (segment.objects?.some((obj: { name?: string }) => obj.name?.toLowerCase().includes(searchLower))) {
        const matchingObjects = segment.objects
          .filter((obj: { name?: string }) => obj.name?.toLowerCase().includes(searchLower))
          .map((obj: { name?: string }) => obj.name)
          .join(', ');
        
        results.push({
          type: 'object',
          id: `object_${segmentId}`,
          startTime: segment.startTime || 0,
          endTime: segment.endTime || 30,
          description: `Objects detected: ${matchingObjects}`,
          source: 'Object Detection'
        });
      }

      // Search in activities
      if (segment.activities?.some((act: { name?: string }) => act.name?.toLowerCase().includes(searchLower))) {
        const matchingActivities = segment.activities
          .filter((act: { name?: string }) => act.name?.toLowerCase().includes(searchLower))
          .map((act: { name?: string }) => act.name)
          .join(', ');
        
        results.push({
          type: 'activity',
          id: `activity_${segmentId}`,
          startTime: segment.startTime || 0,
          endTime: segment.endTime || 30,
          description: `Activities: ${matchingActivities}`,
          source: 'Activity Recognition'
        });
      }
    });

    console.log(`🎯 Found ${results.length} search results for "${searchQuery}"`);

    return NextResponse.json({
      success: true,
      query: searchQuery,
      results: results,
      total: results.length
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 