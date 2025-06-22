import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');
    
    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing videoId parameter' },
        { status: 400 }
      );
    }

    console.log(`🔍 Checking data for video: ${videoId}`);

    // Check main video document
    const videoDoc = await adminDb.collection('videos').doc(videoId).get();
    
    if (!videoDoc.exists) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    const videoData = videoDoc.data();
    
    // Check segments collection
    const segmentsSnapshot = await adminDb
      .collection('videos')
      .doc(videoId)
      .collection('segments')
      .limit(5) // Get first 5 segments as samples
      .get();

    const sampleSegments = segmentsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));

    // Get total segment count
    const allSegmentsSnapshot = await adminDb
      .collection('videos')
      .doc(videoId)
      .collection('segments')
      .get();

    const totalSegments = allSegmentsSnapshot.size;

    // Check for segments with actual content
    const segmentsWithAudio = allSegmentsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.audio?.transcript && data.audio.transcript.length > 0;
    }).length;

    const segmentsWithPeople = allSegmentsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.people && data.people.length > 0;
    }).length;

    const segmentsWithObjects = allSegmentsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.objects && data.objects.length > 0;
    }).length;

    return NextResponse.json({
      success: true,
      videoId,
      videoData: {
        status: videoData?.status,
        analysisProgress: videoData?.analysisProgress,
        segmentCount: videoData?.segmentCount,
        successfulSegments: videoData?.processingMetadata?.successfulSegments,
        failedSegments: videoData?.processingMetadata?.failedSegments,
        completedAt: videoData?.processingMetadata?.completedAt
      },
      segmentAnalysis: {
        totalSegments,
        segmentsWithAudio,
        segmentsWithPeople,
        segmentsWithObjects,
        segmentsWithActivities: allSegmentsSnapshot.docs.filter(doc => {
          const data = doc.data();
          return data.activities && data.activities.length > 0;
        }).length
      },
      sampleSegments: sampleSegments.map(segment => ({
        id: segment.id,
        segmentNumber: segment.data.segmentNumber,
        hasAudio: !!(segment.data.audio?.transcript?.length > 0),
        audioTranscript: segment.data.audio?.transcript?.substring(0, 100) + '...',
        peopleCount: segment.data.people?.length || 0,
        objectsCount: segment.data.objects?.length || 0,
        activitiesCount: segment.data.activities?.length || 0,
        searchableText: segment.data.searchableText?.substring(0, 100) + '...'
      }))
    });

  } catch (error) {
    console.error('Data check error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 