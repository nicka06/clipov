import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');
    
    if (!videoId) {
      return NextResponse.json(
        { error: 'Missing required parameter: videoId' },
        { status: 400 }
      );
    }

    // Get video document from Firestore
    const videoDoc = await adminDb.collection('videos').doc(videoId).get();
    
    if (!videoDoc.exists) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    const videoData = videoDoc.data();
    
    // Return current status and progress
    return NextResponse.json({
      videoId,
      status: videoData?.status || 'unknown',
      progress: videoData?.analysisProgress || 0,
      error: videoData?.analysisError || null,
      analysisTriggered: videoData?.analysisTriggered || false,
      analysisStartedAt: videoData?.analysisStartedAt || null,
      analyzedAt: videoData?.analyzedAt || null,
      segmentCount: videoData?.segmentCount || null,
      duration: videoData?.duration || null,
      metadata: {
        fileName: videoData?.fileName,
        fileSize: videoData?.fileSize,
        resolution: videoData?.resolution,
        format: videoData?.format
      }
    });

  } catch (error) {
    console.error('Analysis status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Handle manual analysis trigger or retry
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await verifyIdToken(token);
    const userId = decodedToken.uid;

    const body = await request.json();
    const { videoId, action } = body;

    if (!videoId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, action' },
        { status: 400 }
      );
    }

    const videoRef = adminDb.collection('videos').doc(videoId);
    const videoDoc = await videoRef.get();

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

    if (action === 'retry') {
      // Reset analysis status and trigger retry
      await videoRef.update({
        status: 'queued',
        analysisProgress: 0,
        analysisError: null,
        analysisStartedAt: null,
        analyzedAt: null
      });

      // Here you would typically re-queue the analysis task
      // For now, just return success
      return NextResponse.json({
        success: true,
        message: 'Analysis retry queued',
        videoId,
        status: 'queued'
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Analysis action error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 