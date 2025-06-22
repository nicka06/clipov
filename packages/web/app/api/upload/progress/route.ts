import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Verify Firebase ID token
    const token = authHeader.split(' ')[1];
    const decodedToken = await verifyIdToken(token);
    const userId = decodedToken.uid;

    // Parse request body
    const body = await request.json();
    const { sessionId, chunkIndex, status, uploadSpeed } = body;

    // Validate required fields
    if (!sessionId || chunkIndex === undefined || !status) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: sessionId, chunkIndex, status' },
        { status: 400 }
      );
    }

    // Get upload session from Firestore
    const sessionRef = adminDb.collection('upload_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Upload session not found' },
        { status: 404 }
      );
    }

    const sessionData = sessionDoc.data();
    
    // Verify user owns this session
    if (sessionData?.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized access to upload session' },
        { status: 403 }
      );
    }

    // Update chunk status
    let chunksCompleted = sessionData.chunksCompleted || [];
    let chunksFailed = sessionData.chunksFailed || [];

    if (status === 'completed') {
      // Add to completed chunks if not already there
      if (!chunksCompleted.includes(chunkIndex)) {
        chunksCompleted.push(chunkIndex);
      }
      // Remove from failed chunks if it was there
      chunksFailed = chunksFailed.filter((idx: number) => idx !== chunkIndex);
    } else if (status === 'failed') {
      // Add to failed chunks if not already there
      if (!chunksFailed.includes(chunkIndex)) {
        chunksFailed.push(chunkIndex);
      }
      // Remove from completed chunks if it was there
      chunksCompleted = chunksCompleted.filter((idx: number) => idx !== chunkIndex);
    }

    // Calculate progress
    const totalChunks = sessionData.totalChunks || 0;
    const progress = totalChunks > 0 ? Math.round((chunksCompleted.length / totalChunks) * 100) : 0;

    // Calculate estimated time remaining
    let estimatedTimeRemaining = 0;
    if (uploadSpeed && uploadSpeed > 0 && progress > 0) {
      const remainingChunks = totalChunks - chunksCompleted.length;
      const avgChunkSize = sessionData.chunkSize || 0;
      const remainingBytes = remainingChunks * avgChunkSize;
      estimatedTimeRemaining = Math.round(remainingBytes / uploadSpeed);
    }

    // Update session document
    const updates = {
      chunksCompleted,
      chunksFailed,
      progress,
      lastUpdated: new Date(),
      ...(uploadSpeed && { uploadSpeed }),
      ...(estimatedTimeRemaining && { estimatedTimeRemaining }),
    };

    // Update session status based on progress
    if (progress === 100) {
      updates.status = 'uploading_complete';
    } else if (chunksFailed.length > 0) {
      updates.status = 'uploading_with_errors';
    } else if (chunksCompleted.length > 0) {
      updates.status = 'uploading';
    }

    await sessionRef.update(updates);

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        progress,
        chunksCompleted: chunksCompleted.length,
        chunksFailed: chunksFailed.length,
        totalChunks,
        status: updates.status,
        estimatedTimeRemaining,
      }
    });

  } catch (error) {
    console.error('Upload progress error:', error);
    
    // Handle specific Firebase errors
    if (error instanceof Error) {
      if (error.message.includes('Invalid token')) {
        return NextResponse.json(
          { success: false, error: 'Invalid authentication token' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 