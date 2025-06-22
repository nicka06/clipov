import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, adminDb, adminStorage } from '@/lib/firebase-admin';
import { generateChunkPath } from '@shared/utils/upload';
import { SIGNED_URL_EXPIRY_HOURS } from '@shared/constants/upload';

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
    const { uploadSessionId } = await request.json();

    if (!uploadSessionId) {
      return NextResponse.json(
        { success: false, error: 'Missing uploadSessionId' },
        { status: 400 }
      );
    }

    // Get upload session from Firestore
    const sessionDoc = await adminDb
      .collection('upload_sessions')
      .doc(uploadSessionId)
      .get();

    if (!sessionDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Upload session not found' },
        { status: 404 }
      );
    }

    const sessionData = sessionDoc.data();
    if (!sessionData) {
      return NextResponse.json(
        { success: false, error: 'Invalid upload session data' },
        { status: 400 }
      );
    }

    // Verify user owns this session
    if (sessionData.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized access to upload session' },
        { status: 403 }
      );
    }

    // Check if session has expired
    const now = new Date();
    const expiresAt = sessionData.expiresAt.toDate();
    if (now > expiresAt) {
      return NextResponse.json(
        { success: false, error: 'Upload session has expired' },
        { status: 410 }
      );
    }

    const { totalChunks, completedChunks = [], fileName } = sessionData;
    const bucket = adminStorage.bucket();

    // Check which chunks exist in Cloud Storage
    const existingChunks: number[] = [];
    const missingChunks: number[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = generateChunkPath(userId, uploadSessionId, i);
      const file = bucket.file(chunkPath);
      
      try {
        const [exists] = await file.exists();
        if (exists) {
          existingChunks.push(i);
        } else {
          missingChunks.push(i);
        }
      } catch {
        // If we can't check existence, assume it's missing
        missingChunks.push(i);
      }
    }

    // Generate signed URLs only for missing chunks
    const newChunkUrls: { [key: number]: string } = {};
    
    for (const chunkIndex of missingChunks) {
      const chunkPath = generateChunkPath(userId, uploadSessionId, chunkIndex);
      const file = bucket.file(chunkPath);
      
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + SIGNED_URL_EXPIRY_HOURS * 60 * 60 * 1000,
        contentType: 'application/octet-stream',
      });
      
      newChunkUrls[chunkIndex] = signedUrl;
    }

    // Update session with current progress
    await sessionDoc.ref.update({
      completedChunks: existingChunks,
      resumedAt: new Date(),
    });

    // Calculate progress
    const progress = Math.round((existingChunks.length / totalChunks) * 100);

    return NextResponse.json({
      success: true,
      uploadSessionId,
      totalChunks,
      existingChunks,
      missingChunks,
      chunkUrls: newChunkUrls,
      progress,
      status: existingChunks.length === totalChunks ? 'ready_to_finalize' : 'resuming'
    });

  } catch (error) {
    console.error('Resume upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 