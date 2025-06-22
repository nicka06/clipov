import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, adminDb, adminStorage } from '@/lib/firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { SUPPORTED_VIDEO_TYPES, MAX_FILE_SIZE, MIN_FILE_SIZE, UPLOAD_SESSION_EXPIRY_DAYS, SIGNED_URL_EXPIRY_HOURS } from '@clipov/shared';
import { calculateChunkSize, generateChunkPath } from '@clipov/shared';

// Generate signed URLs for each chunk
async function generateSignedUrls(
  userId: string,
  sessionId: string,
  totalChunks: number
): Promise<string[]> {
  const bucket = adminStorage.bucket();
  const signedUrls: string[] = [];
  
  // Generate signed URLs for each chunk
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = generateChunkPath(userId, sessionId, i);
    const file = bucket.file(chunkPath);
    
    // Generate signed URL for upload
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + SIGNED_URL_EXPIRY_HOURS * 60 * 60 * 1000,
      contentType: 'application/octet-stream',
    });
    
    signedUrls.push(signedUrl);
  }
  
  return signedUrls;
}

export async function POST(request: NextRequest) {
  console.log('🔄 API: Upload initiate request received');
  
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    console.log('🔑 API: Authorization header present:', !!authHeader);
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ API: Missing or invalid authorization header');
      return NextResponse.json(
        { success: false, error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    // Verify Firebase ID token
    const token = authHeader.split(' ')[1];
    console.log('🔍 API: Verifying Firebase ID token...');
    
    const decodedToken = await verifyIdToken(token);
    const userId = decodedToken.uid;
    console.log('✅ API: Token verified for user:', userId);

    // Parse request body
    const body = await request.json();
    const { fileName, fileSize, fileType } = body;
    console.log('📄 API: Request body:', { fileName, fileSize, fileType });

    // Validate required fields
    if (!fileName || !fileSize || !fileType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: fileName, fileSize, fileType' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!SUPPORTED_VIDEO_TYPES.includes(fileType)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${fileType}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (fileSize < MIN_FILE_SIZE || fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          success: false, 
          error: `File size must be between ${MIN_FILE_SIZE} bytes and ${MAX_FILE_SIZE} bytes` 
        },
        { status: 400 }
      );
    }

    // Calculate chunk details
    const chunkSize = calculateChunkSize(fileSize);
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    // Generate unique session ID
    const uploadSessionId = uuidv4();

    // Generate signed URLs for all chunks
    const chunkUrls = await generateSignedUrls(userId, uploadSessionId, totalChunks);

    // Create upload session document in Firestore
    const sessionDoc = {
      userId,
      fileName,
      fileSize,
      fileType,
      totalChunks,
      chunkSize,
      chunksCompleted: [],
      chunksFailed: [],
      status: 'initializing',
      progress: 0,
      uploadSpeed: 0,
      estimatedTimeRemaining: 0,
      createdAt: new Date(),
      lastUpdated: new Date(),
      expiresAt: new Date(Date.now() + UPLOAD_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    };

    await adminDb.collection('upload_sessions').doc(uploadSessionId).set(sessionDoc);
    console.log('✅ API: Upload session created in Firestore');

    // Return success response
    const response = {
      success: true,
      data: {
        uploadSessionId,
        chunkUrls,
        totalChunks,
        chunkSize,
        expiresAt: Date.now() + SIGNED_URL_EXPIRY_HOURS * 60 * 60 * 1000,
      }
    };
    console.log('📤 API: Returning success response:', { 
      uploadSessionId, 
      totalChunks, 
      chunkSize, 
      chunkUrlsCount: chunkUrls.length 
    });
    
    return NextResponse.json(response);

  } catch (error) {
    console.error('Upload initiation error:', error);
    
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