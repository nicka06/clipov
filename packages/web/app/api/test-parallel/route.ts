import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { segmentCount = 20 } = await request.json();
    
    console.log(`🧪 Testing parallel processing with ${segmentCount} mock segments`);
    
    // Create mock segments
    const segments = Array.from({ length: segmentCount }, (_, i) => ({
      segmentNumber: i + 1,
      startTime: i * 30,
      endTime: (i + 1) * 30,
      duration: 30,
      audioPath: `/tmp/mock-audio-${i + 1}.wav`,
      cloudStoragePath: `gs://mock-bucket/segment_${i + 1}.mp4`
    }));
    
    console.log(`📦 Created ${segments.length} mock segments`);
    
    // Test parallel processing logic
    const PARALLEL_LIMIT = 8;
    const segmentChunks = [];
    for (let i = 0; i < segments.length; i += PARALLEL_LIMIT) {
      segmentChunks.push(segments.slice(i, i + PARALLEL_LIMIT));
    }
    
    console.log(`🚀 Split ${segments.length} segments into ${segmentChunks.length} parallel batches`);
    
    const startTime = Date.now();
    let completedSegments = 0;
    
    // Process chunks in parallel (simulated)
    for (let chunkIndex = 0; chunkIndex < segmentChunks.length; chunkIndex++) {
      const chunk = segmentChunks[chunkIndex];
      
      console.log(`🚀 Processing batch ${chunkIndex + 1}/${segmentChunks.length} (${chunk.length} segments in parallel)...`);
      
      const chunkStartTime = Date.now();
      
      // Simulate parallel processing
      await Promise.all(
        chunk.map(async (segment) => {
          // Simulate analysis time
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
          console.log(`✅ Mock segment ${segment.segmentNumber} completed`);
          return { segmentNumber: segment.segmentNumber, success: true };
        })
      );
      
      const chunkDuration = Math.round((Date.now() - chunkStartTime) / 1000);
      console.log(`⚡ Batch ${chunkIndex + 1} completed in ${chunkDuration}s`);
      
      completedSegments += chunk.length;
      console.log(`📊 Progress: ${completedSegments}/${segments.length} segments completed`);
    }
    
    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`🎉 Parallel processing test completed!`);
    console.log(`📊 Performance Summary:`);
    console.log(`   Total time: ${totalDuration}s`);
    console.log(`   Segments: ${segments.length}`);
    console.log(`   Batches: ${segmentChunks.length}`);
    console.log(`   Parallel limit: ${PARALLEL_LIMIT}`);
    console.log(`   Average per segment: ${Math.round(totalDuration / segments.length * 1000)}ms`);
    
    return NextResponse.json({
      success: true,
      message: 'Parallel processing test completed successfully',
      results: {
        totalDuration,
        segmentCount: segments.length,
        batchCount: segmentChunks.length,
        parallelLimit: PARALLEL_LIMIT,
        averagePerSegment: Math.round(totalDuration / segments.length * 1000),
        speedupEstimate: `${Math.round(segments.length / PARALLEL_LIMIT)}x faster than sequential`
      }
    });
    
  } catch (error) {
    console.error('🧪 Parallel processing test failed:', error);
    return NextResponse.json(
      { error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 