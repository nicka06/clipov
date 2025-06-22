import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Import interfaces from existing audio analyzer
export interface AudioAnalysisResult {
  transcript: string;
  confidence: number;
  speakerCount: number;
  speakers: Speaker[];
  audioEvents: AudioEvent[];
  audioQuality: AudioQuality;
  languageCode: string;
  duration: number;
}

export interface Speaker {
  speakerId: string;
  segments: SpeechSegment[];
  totalSpeakingTime: number;
}

export interface SpeechSegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

export interface AudioEvent {
  type: 'music' | 'applause' | 'laughter' | 'silence' | 'noise' | 'unknown';
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface AudioQuality {
  volume: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  clarity: 'poor' | 'fair' | 'good' | 'excellent';
  backgroundNoise: 'none' | 'low' | 'medium' | 'high';
  overallScore: number; // 0-100
}

export class SelfHostedAudioAnalyzer {
  private aiServiceUrl: string;

  constructor() {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'https://clipov-ai-service-775040410718.us-central1.run.app';
    
    if (!this.aiServiceUrl) {
      throw new Error('❌ AI_SERVICE_URL environment variable not configured');
    }
    
    console.log(`🤖 Self-hosted audio analyzer initialized with service: ${this.aiServiceUrl}`);
  }

  /**
   * Analyze audio segment using self-hosted Whisper service
   */
  async analyzeAudioSegment(
    audioPath: string,
    segmentNumber: number,
    videoId: string,
    userId: string
  ): Promise<AudioAnalysisResult> {
    try {
      console.log(`🎵 Starting self-hosted audio analysis for segment ${segmentNumber}`);
      
      // Ensure audio file exists
      const audioExists = await this.checkFileExists(audioPath);
      if (!audioExists) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // Read audio file
      const audioBuffer = await fs.readFile(audioPath);
      console.log(`📊 Audio file stats: ${audioBuffer.length} bytes`);

      // Call self-hosted AI service
      const transcriptionResult = await this.callTranscriptionService(audioPath);
      
      // Analyze audio quality (simple heuristics)
      const audioQuality = this.analyzeAudioQuality(audioBuffer);
      
      // Detect audio events (simple heuristics)
      const audioEvents = this.detectAudioEvents(audioBuffer, transcriptionResult.duration);
      
      // Extract speaker information from transcription
      const { speakerCount, speakers } = this.extractSpeakerInfo(transcriptionResult);

      const result: AudioAnalysisResult = {
        transcript: transcriptionResult.transcript,
        confidence: transcriptionResult.confidence || 0.95, // Whisper is generally very accurate
        speakerCount,
        speakers,
        audioEvents,
        audioQuality,
        languageCode: transcriptionResult.language || 'en',
        duration: transcriptionResult.duration
      };

      console.log(`✅ Self-hosted audio analysis completed for segment ${segmentNumber}`);
      console.log(`📝 Transcript: "${result.transcript.substring(0, 100)}..."`);
      console.log(`🗣️ Speakers detected: ${speakerCount}`);
      
      return result;

    } catch (error) {
      console.error(`❌ Self-hosted audio analysis failed for segment ${segmentNumber}:`, error);
      throw new Error(`Self-hosted audio analysis failed: ${error}`);
    }
  }

  /**
   * Call the self-hosted AI service for transcription
   */
  private async callTranscriptionService(audioPath: string): Promise<{
    transcript: string;
    language: string;
    confidence?: number;
    segments: Array<{
      text: string;
      start: number;
      end: number;
      confidence: number;
    }>;
    duration: number;
  }> {
    try {
      console.log(`🌐 Calling self-hosted Whisper service at: ${this.aiServiceUrl}/analyze/audio/analyze`);
      
      // Create form data
      const formData = new FormData();
      const audioBuffer = await fs.readFile(audioPath);
      formData.append('file', audioBuffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      });

      // Call the AI service
      const response = await fetch(`${this.aiServiceUrl}/analyze/audio/analyze`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ AI service error response: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`AI service responded with status ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as any;
      console.log(`📊 AI service response: ${JSON.stringify(result).substring(0, 200)}...`);
      
      console.log(`✅ Self-hosted transcription completed. Language: ${result.language}`);
      
      return {
        transcript: result.transcript || '',
        language: result.language || 'en',
        confidence: 0.95, // Whisper doesn't provide confidence, but is generally accurate
        segments: result.segments || [],
        duration: result.duration || 0
      };

    } catch (error) {
      console.error('❌ Self-hosted transcription service failed:', error);
      throw error;
    }
  }

  /**
   * Extract speaker information (simplified - Whisper doesn't do diarization)
   */
  private extractSpeakerInfo(transcriptionResult: any): { speakerCount: number; speakers: Speaker[] } {
    // For now, assume single speaker (Whisper doesn't do diarization by default)
    // In the future, we could integrate a separate speaker diarization model
    
    if (!transcriptionResult.transcript || transcriptionResult.transcript.trim() === '') {
      return { speakerCount: 0, speakers: [] };
    }

    const segments: SpeechSegment[] = [];
    
    // Convert Whisper segments to our format
    if (transcriptionResult.segments && transcriptionResult.segments.length > 0) {
      transcriptionResult.segments.forEach((segment: any) => {
        segments.push({
          startTime: segment.start,
          endTime: segment.end,
          text: segment.text.trim(),
          confidence: segment.confidence || 0.95
        });
      });
    } else {
      // Fallback: create single segment for entire transcript
      segments.push({
        startTime: 0,
        endTime: transcriptionResult.duration || 30,
        text: transcriptionResult.transcript,
        confidence: 0.95
      });
    }

    const totalSpeakingTime = segments.reduce((total, segment) => 
      total + (segment.endTime - segment.startTime), 0
    );

    const speakers: Speaker[] = [{
      speakerId: 'speaker_1',
      segments,
      totalSpeakingTime
    }];

    return {
      speakerCount: 1,
      speakers
    };
  }

  /**
   * Analyze audio quality using simple heuristics
   */
  private analyzeAudioQuality(audioBuffer: Buffer): AudioQuality {
    const fileSize = audioBuffer.length;
    const estimatedBitrate = fileSize / 30; // Rough estimate for 30-second audio
    
    let volume: AudioQuality['volume'] = 'medium';
    let clarity: AudioQuality['clarity'] = 'good';
    let backgroundNoise: AudioQuality['backgroundNoise'] = 'low';
    
    // Simple heuristics based on file size
    if (estimatedBitrate < 1000) {
      volume = 'low';
      clarity = 'poor';
    } else if (estimatedBitrate > 5000) {
      volume = 'high';
      clarity = 'excellent';
      backgroundNoise = 'none';
    }

    const overallScore = Math.min(100, Math.max(0, (estimatedBitrate / 3000) * 100));

    return {
      volume,
      clarity,
      backgroundNoise,
      overallScore
    };
  }

  /**
   * Detect audio events using simple heuristics
   */
  private detectAudioEvents(audioBuffer: Buffer, duration: number): AudioEvent[] {
    const events: AudioEvent[] = [];
    
    // Simple heuristics - in a real system, you'd use audio analysis libraries
    const fileSize = audioBuffer.length;
    const avgBytesPerSecond = fileSize / duration;
    
    // Very simple silence detection based on file size
    if (avgBytesPerSecond < 500) {
      events.push({
        type: 'silence',
        startTime: 0,
        endTime: duration,
        confidence: 0.7
      });
    }
    
    return events;
  }

  /**
   * Check if file exists
   */
  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePaths: string[]): Promise<void> {
    const cleanupPromises = filePaths.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
        console.log(`🗑️ Cleaned up: ${filePath}`);
      } catch (error) {
        console.warn(`⚠️ Failed to clean up ${filePath}:`, error);
      }
    });

    await Promise.all(cleanupPromises);
  }
} 