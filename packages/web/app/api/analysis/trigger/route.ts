import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import type { VideoSegment } from '@clipov/shared/server';

export async function POST(request: NextRequest) {
  // Parse the request body once at the top
  const body = await request.json();
  const { videoId, userId } = body;
  
  // Initialize timing variables
  const analysisStartTime = Date.now();

  try {
    console.log('Analysis trigger endpoint called');
    
    if (!videoId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, userId' },
        { status: 400 }
      );
    }
    console.log(`🚀 Starting analysis for video ${videoId} by user ${userId}`);
    console.log(`⏰ Analysis started at ${new Date().toLocaleTimeString()}`);

    // Update video status to "analyzing"
    await adminDb.collection('videos').doc(videoId).update({
      status: 'analyzing',
      analysisStartedAt: new Date(),
      analysisProgress: 0,
      currentStep: 'Initializing analysis...',
      stepDetails: 'Setting up video processing pipeline'
    });

    console.log(`✅ Analysis started successfully - returning immediate response`);
    
    // Return success immediately - don't wait for processing!
    const response = NextResponse.json({
      success: true,
      message: 'Video analysis started successfully',
      videoId,
      status: 'analyzing'
    });

    // Start background processing (don't await!)
    processVideoInBackground(videoId, userId, analysisStartTime).catch(error => {
      console.error('❌ Background analysis failed:', error);
    });

    return response;

  } catch (error) {
    console.error('❌ Analysis trigger error:', error);
    
    return NextResponse.json(
      { 
        error: 'Analysis failed to start',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Background processing function that doesn't block the HTTP response
async function processVideoInBackground(videoId: string, userId: string, analysisStartTime: number): Promise<void> {
  let timeoutMonitor: NodeJS.Timeout | undefined;
  
  try {
    console.log(`🔄 Background processing started for video ${videoId}`);
    
    // Initialize timeout monitoring for background process
    timeoutMonitor = setInterval(() => {
      const elapsed = Math.round((Date.now() - analysisStartTime) / 1000 / 60);
      console.log(`⏰ ${elapsed} minutes elapsed - background analysis still in progress`);
      if (elapsed >= 8) {
        console.log(`⚠️ ${elapsed} minutes elapsed - approaching timeout limit!`);
      }
    }, 60000); // Check every minute

    // Dynamic imports to prevent Next.js build issues with Google Cloud packages
    const { VideoProcessor, VideoSegmenter, SelfHostedAudioAnalyzer, SelfHostedVisualAnalyzer } = await import('@clipov/shared/server');
    
    // Initialize processors
    const videoProcessor = new VideoProcessor();
    const videoSegmenter = new VideoSegmenter();
    
    let downloadedVideoPath: string | null = null;
    let standardizedVideoPath: string | null = null;
    let audioPath: string | null = null;
    
    try {
      // Step 1: Download video from Cloud Storage
      console.log('📥 Step 1: Downloading video... (1/8 steps, 5% complete)');
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 5,
        currentStep: 'Downloading video',
        stepDetails: 'Retrieving video file from cloud storage'
      });
      
      const downloadStartTime = Date.now();
      downloadedVideoPath = await videoProcessor.downloadVideo(videoId, userId);
      const downloadDuration = Math.round((Date.now() - downloadStartTime) / 1000);
      console.log(`✅ Video downloaded in ${downloadDuration}s: ${downloadedVideoPath}`);
      
      // Step 2: Validate video
      console.log('🔍 Step 2: Validating video... (2/8 steps, 10% complete)');
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 10,
        currentStep: 'Validating video',
        stepDetails: 'Checking video format and extracting metadata'
      });
      
      const validationStartTime = Date.now();
      const metadata = await videoProcessor.validateVideo(downloadedVideoPath);
      const validationDuration = Math.round((Date.now() - validationStartTime) / 1000);
      console.log(`✅ Video validated in ${validationDuration}s:`, metadata);
      console.log(`📊 Duration: ${Math.round(metadata.duration)}s, Resolution: ${metadata.resolution}, Frame Rate: ${metadata.frameRate}fps`);
      
      // Update video document with metadata
      await adminDb.collection('videos').doc(videoId).update({
        duration: metadata.duration,
        resolution: metadata.resolution,
        format: metadata.format,
        frameRate: metadata.frameRate,
        audioChannels: metadata.audioChannels
      });
      
      // Step 3: Standardize video format
      console.log('⚙️ Step 3: Standardizing video... (3/8 steps, 15% complete)');
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 15,
        currentStep: 'Standardizing video',
        stepDetails: `Converting to standard format (${metadata.resolution} → 1920x1080, ${metadata.frameRate}fps → 30fps)`
      });
      
      const standardizeStartTime = Date.now();
      standardizedVideoPath = await videoProcessor.standardizeVideo(downloadedVideoPath);
      const standardizeDuration = Math.round((Date.now() - standardizeStartTime) / 1000);
      console.log(`✅ Video standardized in ${standardizeDuration}s`);
      
      // Step 4: Extract audio track
      console.log('🎵 Step 4: Extracting audio... (4/8 steps, 18% complete)');
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 18,
        currentStep: 'Extracting audio',
        stepDetails: 'Converting video audio to WAV format for speech analysis'
      });
      
      const audioStartTime = Date.now();
      audioPath = await videoProcessor.extractAudioTrack(standardizedVideoPath);
      const audioDuration = Math.round((Date.now() - audioStartTime) / 1000);
      console.log(`✅ Audio extracted in ${audioDuration}s: ${audioPath}`);
      
      // Step 5: Calculate segment count (OPTIMIZED: 30-second segments for speed)
      const SEGMENT_DURATION = 30; // Increased from 5 to 30 seconds for 6x fewer segments
      const segmentCount = Math.ceil(metadata.duration / SEGMENT_DURATION);
      console.log(`📐 Will create ${segmentCount} segments (${SEGMENT_DURATION}-second chunks from ${Math.round(metadata.duration)}s video)`);
      console.log(`🚀 SPEED OPTIMIZATION: Using ${SEGMENT_DURATION}s segments instead of 5s (${Math.round(116/segmentCount)}x fewer API calls)`);
      
      // Update progress
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 20,
        segmentCount: segmentCount,
        currentStep: 'Planning segmentation (Speed Optimized)',
        stepDetails: `Will create ${segmentCount} segments of ${SEGMENT_DURATION} seconds each for faster processing`
      });
      
      // Step 6: Create optimized segments  
      console.log(`✂️ Step 6: Creating video segments... (5/8 steps, 25% complete)`);
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 25,
        currentStep: 'Creating video segments',
        stepDetails: `Splitting video into ${segmentCount} optimized ${SEGMENT_DURATION}s segments for faster analysis`
      });
      
      const segmentStartTime = Date.now();
      const segments = await videoSegmenter.segmentVideo(
        standardizedVideoPath,
        videoId,
        userId
      );
      const segmentDuration = Math.round((Date.now() - segmentStartTime) / 1000);
      
      console.log(`✅ Created ${segments.length} video segments in ${segmentDuration}s (${SEGMENT_DURATION}s each for speed)`);
      
      // RACE CONDITION FIX: Verify ALL segments are accessible before starting AI analysis
      console.log(`🔍 Step 6.5: Verifying all segments are accessible in Cloud Storage...`);
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 35,
        currentStep: 'Verifying segment availability',
        stepDetails: `Ensuring all ${segments.length} segments are ready for AI analysis`
      });
      
      const verificationStartTime = Date.now();
      await verifyAllSegmentsReady(segments);
      const verificationDuration = Math.round((Date.now() - verificationStartTime) / 1000);
      console.log(`✅ All ${segments.length} segments verified and ready for analysis in ${verificationDuration}s`);
      
      // Update progress
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 40
      });
      
      // Step 7: Store segment metadata in Firestore
      console.log('💾 Step 7: Storing segment metadata... (6/8 steps, 45% complete)');
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 45,
        currentStep: 'Storing segment metadata',
        stepDetails: `Saving ${segments.length} segment records to database`
      });
      
      const batch = adminDb.batch();
      
             segments.forEach((segment: VideoSegment) => {
        const segmentRef = adminDb
          .collection('videos')
          .doc(videoId)
          .collection('segments')
          .doc(`segment_${segment.segmentNumber.toString().padStart(3, '0')}`);
        
        batch.set(segmentRef, {
          segmentNumber: segment.segmentNumber,
          startTime: segment.startTime,
          endTime: segment.endTime,
          duration: segment.duration,
          videoPath: segment.cloudStoragePath,
          thumbnailPath: `videos/${userId}/${videoId}/thumbnails/segment_${segment.segmentNumber.toString().padStart(3, '0')}.jpg`,
          
          // Placeholder for AI analysis results (will be filled by analysis pipeline)
          people: [],
          objects: [],
          activities: [],
          audio: {
            transcript: '',
            speakerCount: 0,
            audioEvents: [],
            volume: 'unknown',
            clarity: 'unknown'
          },
          sceneContext: {
            location: 'unknown',
            timeOfDay: 'unknown',
            lighting: 'unknown',
            cameraAngle: 'unknown',
            mood: 'unknown'
          },
          searchableText: '',
          
          // Processing metadata
          processingMetadata: {
            createdAt: new Date(),
            analyzedAt: null,
            videoIntelligenceTime: 0,
            speechToTextTime: 0,
            totalProcessingTime: 0,
            apiCosts: {
              videoIntelligence: 0,
              speechToText: 0,
              total: 0
            }
          }
        });
      });
      
      const batchStartTime = Date.now();
      await batch.commit();
      const batchDuration = Math.round((Date.now() - batchStartTime) / 1000);
      console.log(`✅ Segment metadata stored in Firestore in ${batchDuration}s`);
      
      // Update progress
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 60
      });
      
      // Step 8: Initialize AI analyzers
      console.log('🤖 Step 8: Initializing AI analyzers... (7/8 steps, 65% complete)');
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 65,
        currentStep: 'Initializing AI services',
        stepDetails: 'Setting up self-hosted AI service (Whisper + YOLO + CLIP)'
      });
      
      const audioAnalyzer = new SelfHostedAudioAnalyzer();
      const visualAnalyzer = new SelfHostedVisualAnalyzer();
      console.log('✅ Self-hosted AI analyzers initialized successfully');
      
      // Update progress
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 70
      });
      
      // Step 9: Run PARALLEL AI analysis on segments (SELF-HOSTED!)
      console.log(`🚀 Step 9: Running PARALLEL AI analysis on ${segments.length} segments... (8/8 steps, 70% complete)`);
      console.log(`⚡ SELF-HOSTED OPTIMIZATION: No more Google API quotas - processing at full speed!`);
      await adminDb.collection('videos').doc(videoId).update({
        analysisProgress: 70,
        currentStep: 'AI Analysis (Self-Hosted Parallel Processing)',
        stepDetails: `Running parallel self-hosted AI analysis on ${segments.length} segments`
      });
      
      const aiAnalysisStartTime = Date.now();
      const PARALLEL_LIMIT = 2; // Reduced back to 2 due to Cloud Run memory/CPU limits
      console.log(`🔥 Processing up to ${PARALLEL_LIMIT} segments simultaneously (Cloud Run optimized)`);
      console.log(`⚖️ OPTIMIZATION: Using 2 parallel segments to avoid Cloud Run timeouts`);
      
      // Split segments into chunks for parallel processing
      const segmentChunks = [];
      for (let i = 0; i < segments.length; i += PARALLEL_LIMIT) {
        segmentChunks.push(segments.slice(i, i + PARALLEL_LIMIT));
      }
      
      console.log(`📦 Split ${segments.length} segments into ${segmentChunks.length} parallel batches`);
      
      let completedSegments = 0;
      let successfulSegments = 0;
      let failedSegments = 0;
      
      // Process each chunk in parallel
      for (let chunkIndex = 0; chunkIndex < segmentChunks.length; chunkIndex++) {
        const chunk = segmentChunks[chunkIndex];
        const chunkProgress = 70 + Math.round((chunkIndex / segmentChunks.length) * 25);
        
        console.log(`🚀 Processing batch ${chunkIndex + 1}/${segmentChunks.length} (${chunk.length} segments in parallel)...`);
        
        await adminDb.collection('videos').doc(videoId).update({
          analysisProgress: chunkProgress,
          stepDetails: `Parallel processing batch ${chunkIndex + 1}/${segmentChunks.length}: ${chunk.length} segments simultaneously`
        });
        
        // Process all segments in this chunk SIMULTANEOUSLY
        const chunkStartTime = Date.now();
        
        // Define result types for better TypeScript handling
        type SuccessResult = {
          segment: VideoSegment;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          audioResult: any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          visualResult: any;
          success: true;
        };
        
        type FailureResult = {
          segment: VideoSegment;
          error: unknown;
          success: false;
        };
        
        type ChunkResult = SuccessResult | FailureResult;
        
        const chunkResults: ChunkResult[] = await Promise.all(
          chunk.map(async (segment): Promise<ChunkResult> => {
            try {
              console.log(`🔄 [Parallel] Analyzing segment ${segment.segmentNumber}...`);
              
              const segmentAnalysisStart = Date.now();
              // Run audio and visual analysis in parallel for this segment
              const [audioResult, visualResult] = await Promise.all([
                audioAnalyzer.analyzeAudioSegment(
                  segment.audioPath,
                  segment.segmentNumber,
                  videoId,
                  userId
                ),
                visualAnalyzer.analyzeVideoSegment(
                  segment.cloudStoragePath,
                  segment.segmentNumber,
                  videoId,
                  userId
                )
              ]);
              const segmentAnalysisDuration = Math.round((Date.now() - segmentAnalysisStart) / 1000);
              
              console.log(`✅ [Parallel] Segment ${segment.segmentNumber} completed in ${segmentAnalysisDuration}s`);
              console.log(`📝 [Parallel] Transcript: "${audioResult.transcript.substring(0, 50)}${audioResult.transcript.length > 50 ? '...' : ''}"`);
              
              return { segment, audioResult, visualResult, success: true };
            } catch (error) {
              console.error(`❌ [Parallel] Segment ${segment.segmentNumber} failed:`, error);
              return { segment, error, success: false };
            }
          })
        );
        
        const chunkDuration = Math.round((Date.now() - chunkStartTime) / 1000);
        const chunkSuccessCount = chunkResults.filter(r => r.success).length;
        const chunkFailCount = chunkResults.filter(r => !r.success).length;
        console.log(`⚡ Batch ${chunkIndex + 1} completed in ${chunkDuration}s: ${chunkSuccessCount} succeeded, ${chunkFailCount} failed`);
        
        // Update database with results from this chunk
        const updatePromises = chunkResults.map(async (result) => {
          if (!result.success) {
            console.error(`Skipping failed segment ${result.segment.segmentNumber}`);
            failedSegments++;
            return;
          }
          
          // TypeScript now knows this is a SuccessResult
          const { segment, audioResult, visualResult } = result;
          
          // Update segment with AI analysis results
          const segmentRef = adminDb
            .collection('videos')
            .doc(videoId)
            .collection('segments')
            .doc(`segment_${segment.segmentNumber.toString().padStart(3, '0')}`);
          
          try {
            // Use .set() with merge:true to create document if it doesn't exist, or update if it does
            await segmentRef.set({
              // Basic segment info
              segmentNumber: segment.segmentNumber,
              startTime: segment.startTime,
              endTime: segment.endTime,
              duration: segment.duration,
              videoPath: segment.cloudStoragePath,
              
              // Audio analysis results
              audio: {
                transcript: audioResult.transcript,
                speakerCount: audioResult.speakers.length,
                audioEvents: audioResult.audioEvents,
                volume: audioResult.audioQuality.volume,
                clarity: audioResult.audioQuality.clarity,
                speakers: audioResult.speakers
              },
              
              // Visual analysis results
              people: visualResult.people,
              objects: visualResult.objects,
              activities: visualResult.activities,
              sceneContext: visualResult.sceneContext,
              visualFeatures: visualResult.visualFeatures,
              
              // Combined searchable text
              searchableText: [
                audioResult.transcript,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...visualResult.objects.map((obj: any) => obj.name),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...visualResult.activities.map((act: any) => act.name),
                visualResult.sceneContext.location,
                visualResult.sceneContext.setting
              ].filter(text => text && text !== 'unknown').join(' '),
              
              // Analysis metadata
              processingMetadata: {
                createdAt: new Date(),
                analyzedAt: new Date(),
                selfHostedProcessingTime: 0,
                totalProcessingTime: 0,
                apiCosts: {
                  selfHostedService: 0, // Only Cloud Run compute costs
                  total: 0
                },
                // Track migration from Google APIs
                migrationNote: 'Processed with self-hosted AI service (Whisper + YOLO + CLIP)'
              }
            }, { merge: true });
            
            console.log(`✅ [Database] Successfully saved segment ${segment.segmentNumber} analysis results`);
            successfulSegments++;
          } catch (segmentError) {
            console.error(`❌ [Database] Failed to save segment ${segment.segmentNumber}:`, segmentError);
            console.error(`🔍 [Database] Error details:`, {
              videoId,
              segmentNumber: segment.segmentNumber,
              error: segmentError instanceof Error ? segmentError.message : segmentError
            });
            failedSegments++;
          }
        });
        
        // Wait for all database updates to complete
        await Promise.all(updatePromises);
        completedSegments += chunk.length;
        console.log(`📊 Progress: ${completedSegments}/${segments.length} segments completed (${successfulSegments} successful, ${failedSegments} failed)`);
      }
      
      const totalAiDuration = Math.round((Date.now() - aiAnalysisStartTime) / 1000);
      console.log(`🎉 AI analysis completed for all ${segments.length} segments in ${totalAiDuration}s`);
      console.log(`📊 Final Results: ${successfulSegments} successful, ${failedSegments} failed (${Math.round(successfulSegments/segments.length*100)}% success rate)`);
      
      // Determine final status based on success rate
      const successRate = successfulSegments / segments.length;
      let finalStatus: string;
      let statusEmoji: string;
      
      if (successRate >= 0.9) {
        finalStatus = 'analysis_complete';
        statusEmoji = '✅';
      } else if (successRate >= 0.5) {
        finalStatus = 'analysis_partial';
        statusEmoji = '⚠️';
      } else {
        finalStatus = 'analysis_failed';
        statusEmoji = '❌';
      }
      
      // Step 10: Mark analysis with appropriate status
      const totalDuration = Math.round((Date.now() - analysisStartTime) / 1000);
      console.log(`🏁 Step 10: Finalizing analysis... (100% complete)`);
      console.log(`${statusEmoji} Final Status: ${finalStatus} (${Math.round(successRate*100)}% success rate)`);
      
      try {
        await adminDb.collection('videos').doc(videoId).update({
          status: finalStatus,
          analysisProgress: 100,
          analyzedAt: new Date(),
          currentStep: finalStatus === 'analysis_complete' ? 'Analysis complete' : 
                      finalStatus === 'analysis_partial' ? 'Analysis partially complete' : 'Analysis failed',
          stepDetails: `Analyzed ${segments.length} segments: ${successfulSegments} successful, ${failedSegments} failed (${Math.round(successRate*100)}% success rate)`,
          processingMetadata: {
            totalDuration: totalDuration,
            segmentCount: segments.length,
            successfulSegments: successfulSegments,
            failedSegments: failedSegments,
            successRate: Math.round(successRate * 100) / 100,
            completedAt: new Date().toISOString()
          }
        });
        console.log(`✅ [Database] Successfully updated video ${videoId} status to ${finalStatus}`);
      } catch (videoUpdateError) {
        console.error(`❌ [Database] Failed to update video ${videoId} final status:`, videoUpdateError);
        throw videoUpdateError; // Re-throw to trigger error handling
      }
      
      console.log(`🎉 Analysis completed for video ${videoId}`);
      console.log(`📊 Performance Summary:`);
      console.log(`   Total time: ${totalDuration}s (${Math.round(totalDuration/60)}m ${totalDuration%60}s)`);
      console.log(`   Segments: ${segments.length}`);
      console.log(`   Successful: ${successfulSegments} (${Math.round(successRate*100)}%)`);
      console.log(`   Failed: ${failedSegments} (${Math.round((1-successRate)*100)}%)`);
      console.log(`   Video duration: ${Math.round(metadata.duration)}s`);
      console.log(`   Processing ratio: ${Math.round(totalDuration/metadata.duration*100)/100}x real-time`);
      
      // Clear timeout monitor
      if (timeoutMonitor) {
        clearInterval(timeoutMonitor);
      }
      
      // Final success message
      console.log(`\n🏆 ===== VIDEO ANALYSIS ${finalStatus.toUpperCase()} =====`);
      console.log(`🎬 Video ID: ${videoId}`);
      console.log(`👤 User ID: ${userId}`);
      console.log(`⏱️  Total Duration: ${Math.round(totalDuration/60)}m ${totalDuration%60}s`);
      console.log(`📊 Segments Processed: ${segments.length}`);
      console.log(`${statusEmoji} Success Rate: ${Math.round(successRate*100)}% (${successfulSegments}/${segments.length})`);
      console.log(`✅ Status: ${finalStatus.toUpperCase()}`);
      console.log(`🏆 ===============================================\n`);
      
    } finally {
      // Cleanup temporary files
      const filesToCleanup = [downloadedVideoPath, standardizedVideoPath, audioPath].filter(Boolean) as string[];
      if (filesToCleanup.length > 0) {
        await videoProcessor.cleanup(filesToCleanup);
      }
    }
    
        } catch (error) {
    // Clear timeout monitor if it exists
    if (timeoutMonitor) {
      clearInterval(timeoutMonitor);
    }
    
    const failureDuration = Math.round((Date.now() - analysisStartTime) / 1000);
    console.error('❌ Background analysis failed:', error);
    console.error(`🔍 Error Context:`);
    console.error(`   Duration before failure: ${failureDuration}s`);
    console.error(`   Video ID: ${videoId}`);
    console.error(`   User ID: ${userId}`);
    console.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
    console.error(`   Error message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Update video status to failed
    try {
      await adminDb.collection('videos').doc(videoId).update({
        status: 'analysis_failed',
        analysisError: error instanceof Error ? error.message : 'Unknown error',
        analyzedAt: new Date(),
        currentStep: 'Analysis failed',
        stepDetails: `Failed after ${failureDuration}s: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processingMetadata: {
          failureDuration: failureDuration,
          failedAt: new Date().toISOString(),
          errorType: error instanceof Error ? error.constructor.name : typeof error
        }
      });
      console.log(`💾 Updated video status to failed in database`);
    } catch (updateError) {
      console.error('❌ Failed to update video status:', updateError);
    }
  }
}

/**
 * Verify all segments are accessible in Cloud Storage before starting AI analysis
 * This prevents the race condition where AI analysis starts before all uploads complete
 */
async function verifyAllSegmentsReady(segments: VideoSegment[]): Promise<void> {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage();
  
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error('Storage bucket not configured');
  }
  
  console.log(`🔍 Verifying ${segments.length} segments are accessible in Cloud Storage...`);
  
  // Check all segments in parallel with retries
  const verificationPromises = segments.map(async (segment) => {
    const segmentPath = segment.cloudStoragePath;
    const segmentNumber = segment.segmentNumber;
    
    let attempts = 0;
    const maxAttempts = 10; // More retries for final verification
    const retryDelay = 2000; // 2 seconds between retries
    
    while (attempts < maxAttempts) {
      try {
        const file = storage.bucket(bucketName).file(segmentPath);
        const [exists] = await file.exists();
        
        if (exists) {
          // Additional check: verify file has content
          const [metadata] = await file.getMetadata();
          const fileSize = parseInt(String(metadata.size || '0'));
          
          if (fileSize > 1000) { // Reasonable minimum file size for a video segment
            console.log(`✅ Segment ${segmentNumber} verified (${Math.round(fileSize/1024)}KB)`);
            return;
          } else {
            throw new Error(`Segment file too small: ${fileSize} bytes`);
          }
        } else {
          throw new Error(`Segment file does not exist: ${segmentPath}`);
        }
      } catch (error) {
        attempts++;
        if (attempts < maxAttempts) {
          console.log(`⏳ Segment ${segmentNumber} not ready, retrying in ${retryDelay}ms... (${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          throw new Error(`Segment ${segmentNumber} verification failed after ${maxAttempts} attempts: ${error}`);
        }
      }
    }
  });
  
  try {
    await Promise.all(verificationPromises);
    console.log(`🎉 All ${segments.length} segments verified and ready for AI analysis!`);
  } catch (error) {
    console.error(`❌ Segment verification failed:`, error);
    throw new Error(`Not all segments are ready for analysis: ${error}`);
  }
} 