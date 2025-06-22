import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, adminDb, adminStorage } from '@/lib/firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { generateChunkPath, generateVideoPath } from '@shared/utils/upload';

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
    const { sessionId } = body;

    // Validate required fields
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: sessionId' },
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

    // Update session status to assembling
    await sessionRef.update({
      status: 'assembling',
      lastUpdated: new Date(),
    });

    const bucket = adminStorage.bucket();
    const totalChunks = sessionData.totalChunks || 0;
    
    // Verify all chunks exist in Cloud Storage (this is our source of truth)
    const chunkPaths: string[] = [];
    const missingChunks: number[] = [];
    
    console.log(`🔍 Verifying ${totalChunks} chunks exist in Cloud Storage...`);
    
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = generateChunkPath(userId, sessionId, i);
      const chunkFile = bucket.file(chunkPath);
      
      const [exists] = await chunkFile.exists();
      if (!exists) {
        missingChunks.push(i);
        console.error(`❌ Chunk ${i} missing from Cloud Storage: ${chunkPath}`);
      } else {
        chunkPaths.push(chunkPath);
        console.log(`✅ Chunk ${i} verified in Cloud Storage`);
      }
    }
    
    // If any chunks are missing, return error with details
    if (missingChunks.length > 0) {
      console.error(`❌ Upload incomplete: ${missingChunks.length} chunks missing from Cloud Storage`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Upload incomplete: ${totalChunks - missingChunks.length}/${totalChunks} chunks found in Cloud Storage. Missing chunks: ${missingChunks.join(', ')}` 
        },
        { status: 400 }
      );
    }
    
    console.log(`🎉 All ${totalChunks} chunks verified in Cloud Storage!`);

    // Generate unique video ID and final video path
    const videoId = uuidv4();
    const fileExtension = sessionData.fileName.split('.').pop() || 'mp4';
    const finalVideoPath = generateVideoPath(userId, videoId, fileExtension);

    // Use Cloud Storage compose operation to merge chunks into final video
    // Use bucket.combine method for Firebase Admin SDK
    await bucket.combine(chunkPaths, finalVideoPath);

    // Create video document in Firestore
    const videoDoc = {
      videoId,
      userId,
      name: sessionData.fileName.replace(/\.[^/.]+$/, ''), // Remove file extension for display name
      fileName: sessionData.fileName,
      fileSize: sessionData.fileSize,
      uploadSessionId: sessionId,
      status: 'completed',
      storageLocation: finalVideoPath,
      uploadedAt: new Date(),
      createdAt: new Date(),
      metadata: {
        totalChunks,
        chunkSize: sessionData.chunkSize,
        fileType: sessionData.fileType,
      }
    };

    await adminDb.collection('videos').doc(videoId).set(videoDoc);

    // Update session status to completed
    await sessionRef.update({
      status: 'completed',
      videoId,
      lastUpdated: new Date(),
    });

    // Clean up chunk files in background (don't wait for completion)
    cleanupChunks(bucket, chunkPaths).catch(error => {
      console.error('Chunk cleanup error:', error);
      // Log error but don't fail the request
    });

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        videoId,
        status: 'completed',
        storageLocation: finalVideoPath,
        fileName: sessionData.fileName,
        fileSize: sessionData.fileSize,
      }
    });

  } catch (error) {
    console.error('Upload finalization error:', error);
    
    // Handle specific Firebase errors
    if (error instanceof Error) {
      if (error.message.includes('Invalid token')) {
        return NextResponse.json(
          { success: false, error: 'Invalid authentication token' },
          { status: 401 }
        );
      }
      
      if (error.message.includes('compose')) {
        return NextResponse.json(
          { success: false, error: 'Failed to merge video chunks' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to clean up chunk files
async function cleanupChunks(bucket: any, chunkPaths: string[]): Promise<void> {
  try {
    const deletePromises = chunkPaths.map(async (chunkPath) => {
      const chunkFile = bucket.file(chunkPath);
      await chunkFile.delete();
    });
    
    await Promise.all(deletePromises);
    console.log(`Successfully cleaned up ${chunkPaths.length} chunk files`);
  } catch (error) {
    console.error('Error during chunk cleanup:', error);
    throw error;
  }
} 