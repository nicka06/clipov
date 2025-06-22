import { Storage } from '@google-cloud/storage';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';

export interface VideoMetadata {
  duration: number;
  resolution: string;
  format: string;
  frameRate: number;
  audioChannels: number;
  fileSize: number;
}

export class VideoProcessor {
  private storage: Storage;
  private tempDir: string;

  constructor() {
    this.storage = new Storage();
    this.tempDir = '/tmp/video-processing';
  }

  /**
   * Download video from Cloud Storage to local processing environment
   */
  async downloadVideo(videoId: string, userId: string): Promise<string> {
    try {
      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });
      
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
      if (!bucketName) {
        throw new Error('Storage bucket not configured. Set FIREBASE_STORAGE_BUCKET or GOOGLE_CLOUD_STORAGE_BUCKET environment variable.');
      }
      
      const sourceFile = `videos/${userId}/${videoId}.mp4`;
      const localPath = path.join(this.tempDir, `${videoId}_original.mp4`);
      
      console.log(`Downloading video from gs://${bucketName}/${sourceFile}`);
      
      await this.storage
        .bucket(bucketName)
        .file(sourceFile)
        .download({ destination: localPath });
      
      console.log(`Video downloaded to ${localPath}`);
      return localPath;
    } catch (error) {
      console.error('Error downloading video:', error);
      throw new Error(`Failed to download video: ${error}`);
    }
  }

  /**
   * Validate video file integrity and extract metadata
   */
  async validateVideo(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
        if (err) {
          console.error('Error validating video:', err);
          reject(new Error(`Video validation failed: ${err.message}`));
          return;
        }

        try {
          const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video');
          const audioStream = metadata.streams.find((stream: any) => stream.codec_type === 'audio');
          
          if (!videoStream) {
            throw new Error('No video stream found in file');
          }

          const videoMetadata: VideoMetadata = {
            duration: parseFloat(metadata.format.duration || '0'),
            resolution: `${videoStream.width}x${videoStream.height}`,
            format: metadata.format.format_name || 'unknown',
            frameRate: eval(videoStream.r_frame_rate || '30/1'), // Convert fraction to decimal
            audioChannels: audioStream?.channels || 0,
            fileSize: parseInt(metadata.format.size || '0')
          };

          console.log('Video metadata:', videoMetadata);
          resolve(videoMetadata);
        } catch (error) {
          reject(new Error(`Failed to parse video metadata: ${error}`));
        }
      });
    });
  }

  /**
   * Convert video to standardized format (1080p, H.264, AAC audio)
   * Uses hardware acceleration when available for faster processing and reduced CPU load
   */
  async standardizeVideo(inputPath: string): Promise<string> {
    const outputPath = inputPath.replace('_original.mp4', '_standardized.mp4');
    
    // Try hardware acceleration first, fallback to CPU if it fails
    try {
      return await this.standardizeVideoWithHardwareAcceleration(inputPath, outputPath);
    } catch (hardwareError) {
      const errorMessage = hardwareError instanceof Error ? hardwareError.message : 'Unknown hardware acceleration error';
      console.warn('⚠️ Hardware acceleration failed, falling back to CPU encoding:', errorMessage);
      return await this.standardizeVideoWithCPU(inputPath, outputPath);
    }
  }

  /**
   * Standardize video using Apple VideoToolbox hardware acceleration (Mac)
   */
  private async standardizeVideoWithHardwareAcceleration(inputPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`🚀 Standardizing video with hardware acceleration: ${inputPath} -> ${outputPath}`);
      
      ffmpeg(inputPath)
        .videoCodec('h264_videotoolbox') // Apple hardware encoder
        .audioCodec('aac')
        .size('1920x1080')
        .fps(30)
        .audioBitrate('128k')
        .videoBitrate('2000k')
        .format('mp4')
        .outputOptions([
          '-preset', 'fast',           // Faster encoding preset
          '-profile:v', 'high',        // H.264 high profile for better compression
          '-level', '4.0'              // H.264 level 4.0 for broad compatibility
        ])
        .on('start', (commandLine: string) => {
          console.log('⚡ Hardware-accelerated FFmpeg command:', commandLine);
        })
        .on('progress', (progress: any) => {
          console.log(`📈 Hardware acceleration progress: ${progress.percent?.toFixed(1)}%`);
        })
        .on('end', () => {
          console.log('✅ Hardware-accelerated video standardization completed');
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          console.error('❌ Hardware acceleration failed:', err);
          reject(new Error(`Hardware-accelerated standardization failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Fallback: Standardize video using CPU encoding
   */
  private async standardizeVideoWithCPU(inputPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`🐌 Standardizing video with CPU (fallback): ${inputPath} -> ${outputPath}`);
      
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size('1920x1080')
        .fps(30)
        .audioBitrate('128k')
        .videoBitrate('2000k')
        .format('mp4')
        .outputOptions([
          '-preset', 'fast',           // Use faster CPU preset to reduce heat
          '-crf', '23'                 // Constant rate factor for good quality/size balance
        ])
        .on('start', (commandLine: string) => {
          console.log('🖥️ CPU-based FFmpeg command:', commandLine);
        })
        .on('progress', (progress: any) => {
          console.log(`⏳ CPU encoding progress: ${progress.percent?.toFixed(1)}%`);
        })
        .on('end', () => {
          console.log('✅ CPU-based video standardization completed');
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          console.error('❌ CPU encoding failed:', err);
          reject(new Error(`CPU-based standardization failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Extract separate audio track for speech analysis
   */
  async extractAudioTrack(videoPath: string): Promise<string> {
    const audioPath = videoPath.replace('.mp4', '.wav');
    
    return new Promise((resolve, reject) => {
      console.log(`Extracting audio: ${videoPath} -> ${audioPath}`);
      
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav')
        .on('start', (commandLine: string) => {
          console.log('Audio extraction command:', commandLine);
        })
        .on('progress', (progress: any) => {
          console.log(`Audio extraction progress: ${progress.percent?.toFixed(1)}%`);
        })
        .on('end', () => {
          console.log('Audio extraction completed');
          resolve(audioPath);
        })
        .on('error', (err: Error) => {
          console.error('Error extracting audio:', err);
          reject(new Error(`Audio extraction failed: ${err.message}`));
        })
        .save(audioPath);
    });
  }

  /**
   * Calculate total number of 5-second segments
   */
  async calculateSegmentCount(duration: number): Promise<number> {
    return Math.ceil(duration / 5);
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePaths: string[]): Promise<void> {
    try {
      await Promise.all(
        filePaths.map(async (filePath) => {
          try {
            await fs.unlink(filePath);
            console.log(`Cleaned up: ${filePath}`);
          } catch (error) {
            console.warn(`Failed to clean up ${filePath}:`, error);
          }
        })
      );
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
} 