import { Storage } from '@google-cloud/storage';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';

export interface VideoSegment {
  segmentNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  videoPath: string;
  audioPath: string;
  thumbnailPath: string;
  cloudStoragePath: string;
}

export class VideoSegmenter {
  private storage: Storage;
  private tempDir: string;

  constructor() {
    this.storage = new Storage();
    this.tempDir = '/tmp/video-processing';
  }

  /**
   * Split video into 5-second segments
   */
  async segmentVideo(videoPath: string, videoId: string, userId: string): Promise<VideoSegment[]> {
    try {
      const segments: VideoSegment[] = [];
      const outputDir = path.join(this.tempDir, 'segments');
      
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });
      
      // Get video duration
      const duration = await this.getVideoDuration(videoPath);
      const segmentCount = Math.ceil(duration / 5);
      
      console.log(`Segmenting video into ${segmentCount} segments of 5 seconds each`);
      
      // Process segments sequentially to avoid overwhelming the system
      for (let i = 0; i < segmentCount; i++) {
        const startTime = i * 5;
        const endTime = Math.min((i + 1) * 5, duration);
        const actualDuration = endTime - startTime;
        
        console.log(`Processing segment ${i + 1}/${segmentCount}: ${startTime}s - ${endTime}s`);
        
        const segment = await this.extractSegment(
          videoPath,
          startTime,
          actualDuration,
          i + 1,
          outputDir,
          videoId,
          userId
        );
        
        segments.push(segment);
      }
      
      console.log(`Successfully created ${segments.length} video segments`);
      return segments;
    } catch (error) {
      console.error('Error segmenting video:', error);
      throw new Error(`Video segmentation failed: ${error}`);
    }
  }

  /**
   * Extract a single video segment
   */
  async extractSegment(
    videoPath: string,
    startTime: number,
    duration: number,
    segmentNumber: number,
    outputDir: string,
    videoId: string,
    userId: string
  ): Promise<VideoSegment> {
    const segmentFileName = `segment_${segmentNumber.toString().padStart(3, '0')}`;
    const videoSegmentPath = path.join(outputDir, `${segmentFileName}.mp4`);
    const audioSegmentPath = path.join(outputDir, `${segmentFileName}.wav`);
    const thumbnailPath = path.join(outputDir, `${segmentFileName}.jpg`);
    
    // Extract video segment
    await this.extractVideoSegment(videoPath, videoSegmentPath, startTime, duration);
    
    // Extract audio segment
    await this.extractAudioSegment(videoPath, audioSegmentPath, startTime, duration);
    
    // Generate thumbnail at middle of segment
    const thumbnailTime = startTime + (duration / 2);
    await this.generateThumbnail(videoPath, thumbnailPath, thumbnailTime);
    
    // Upload thumbnail to Cloud Storage IMMEDIATELY after generation
    const thumbnailCloudPath = await this.uploadThumbnailToStorage(
      thumbnailPath,
      userId,
      videoId,
      segmentNumber
    );
    
    // Upload segment to Cloud Storage
    const cloudStoragePath = await this.uploadSegmentToStorage(
      videoSegmentPath,
      userId,
      videoId,
      segmentNumber
    );
    
    // Verify the uploads completed and files exist in Cloud Storage
    await this.verifySegmentUpload(cloudStoragePath);
    
    return {
      segmentNumber,
      startTime,
      endTime: startTime + duration,
      duration,
      videoPath: videoSegmentPath,
      audioPath: audioSegmentPath,
      thumbnailPath: thumbnailCloudPath, // Now points to Cloud Storage
      cloudStoragePath
    };
  }

  /**
   * Extract video segment using FFmpeg
   */
  private async extractVideoSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(startTime)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('mp4')
        .on('end', () => {
          console.log(`Video segment extracted: ${outputPath}`);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error('Error extracting video segment:', err);
          reject(new Error(`Video segment extraction failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Extract audio segment using FFmpeg
   */
  private async extractAudioSegment(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(startTime)
        .duration(duration)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav')
        .on('end', () => {
          console.log(`Audio segment extracted: ${outputPath}`);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error('Error extracting audio segment:', err);
          reject(new Error(`Audio segment extraction failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Generate thumbnail at specific time
   */
  async generateThumbnail(videoPath: string, outputPath: string, timeOffset: number): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timeOffset)
        .frames(1)
        .size('320x180')
        .format('image2')
        .on('end', () => {
          console.log(`Thumbnail generated: ${outputPath}`);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error('Error generating thumbnail:', err);
          reject(new Error(`Thumbnail generation failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Upload segment to Cloud Storage
   */
  async uploadSegmentToStorage(
    segmentPath: string,
    userId: string,
    videoId: string,
    segmentNumber: number
  ): Promise<string> {
    try {
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
      if (!bucketName) {
        throw new Error('Storage bucket not configured. Set FIREBASE_STORAGE_BUCKET or GOOGLE_CLOUD_STORAGE_BUCKET environment variable.');
      }
      const fileName = `segment_${segmentNumber.toString().padStart(3, '0')}.mp4`;
      const cloudPath = `videos/${userId}/${videoId}/segments/${fileName}`;
      
      console.log(`Uploading segment to gs://${bucketName}/${cloudPath}`);
      
      await this.storage
        .bucket(bucketName)
        .upload(segmentPath, {
          destination: cloudPath,
          metadata: {
            metadata: {
              videoId,
              userId,
              segmentNumber: segmentNumber.toString(),
              uploadedAt: new Date().toISOString()
            }
          }
        });
      
      console.log(`Segment uploaded successfully: ${cloudPath}`);
      return cloudPath;
    } catch (error) {
      console.error('Error uploading segment:', error);
      throw new Error(`Segment upload failed: ${error}`);
    }
  }

  /**
   * Verify that segment upload completed and file exists in Cloud Storage
   */
  private async verifySegmentUpload(cloudPath: string): Promise<void> {
    try {
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
      if (!bucketName) {
        throw new Error('Storage bucket not configured');
      }
      
      const file = this.storage.bucket(bucketName).file(cloudPath);
      
      // Check if file exists with retries for eventual consistency
      let attempts = 0;
      const maxAttempts = 5;
      const retryDelay = 1000; // 1 second
      
      while (attempts < maxAttempts) {
        const [exists] = await file.exists();
        if (exists) {
          console.log(`✅ Verified segment exists in Cloud Storage: ${cloudPath}`);
          return;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          console.log(`⏳ Segment not yet available, retrying in ${retryDelay}ms... (${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      throw new Error(`Segment verification failed after ${maxAttempts} attempts: ${cloudPath}`);
    } catch (error) {
      console.error('Error verifying segment upload:', error);
      throw new Error(`Segment verification failed: ${error}`);
    }
  }

  /**
   * Upload thumbnail to Cloud Storage
   */
  async uploadThumbnailToStorage(
    thumbnailPath: string,
    userId: string,
    videoId: string,
    segmentNumber: number
  ): Promise<string> {
    try {
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
      if (!bucketName) {
        throw new Error('Storage bucket not configured');
      }
      const fileName = `segment_${segmentNumber.toString().padStart(3, '0')}_thumbnail.jpg`;
      const cloudPath = `videos/${userId}/${videoId}/segments/${fileName}`;
      
      console.log(`📸 Uploading thumbnail to gs://${bucketName}/${cloudPath}`);
      
      await this.storage
        .bucket(bucketName)
        .upload(thumbnailPath, {
          destination: cloudPath,
          metadata: {
            metadata: {
              videoId,
              userId,
              segmentNumber: segmentNumber.toString(),
              type: 'thumbnail',
              uploadedAt: new Date().toISOString()
            }
          }
        });
      
      console.log(`📸 Thumbnail uploaded successfully: ${cloudPath}`);
      return cloudPath;
    } catch (error) {
      console.error('❌ Error uploading thumbnail:', error);
      throw new Error(`Thumbnail upload failed: ${error}`);
    }
  }

  /**
   * Get video duration using FFprobe
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) {
          reject(new Error(`Failed to get video duration: ${err.message}`));
          return;
        }
        
        const duration = parseFloat(metadata.format.duration || '0');
        resolve(duration);
      });
    });
  }

  /**
   * Clean up segment files
   */
  async cleanupSegments(segments: VideoSegment[]): Promise<void> {
    try {
      const filesToClean = segments.flatMap(segment => [
        segment.videoPath,
        segment.audioPath,
        segment.thumbnailPath
      ]);
      
      await Promise.all(
        filesToClean.map(async (filePath) => {
          try {
            await fs.unlink(filePath);
            console.log(`Cleaned up segment file: ${filePath}`);
          } catch (error) {
            console.warn(`Failed to clean up ${filePath}:`, error);
          }
        })
      );
    } catch (error) {
      console.error('Error during segment cleanup:', error);
    }
  }
} 