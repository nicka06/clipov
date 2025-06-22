import { SpeechClient } from '@google-cloud/speech';
import { promises as fs } from 'fs';
import path from 'path';

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

export class AudioAnalyzer {
  private speechClient: SpeechClient;
  private tempDir: string;

  constructor() {
    this.speechClient = new SpeechClient();
    this.tempDir = '/tmp/audio-analysis';
  }

  /**
   * Analyze audio segment for transcript, speakers, and events
   */
  async analyzeAudioSegment(
    audioPath: string,
    segmentNumber: number,
    videoId: string,
    userId: string
  ): Promise<AudioAnalysisResult> {
    try {
      console.log(`🎵 Starting audio analysis for segment ${segmentNumber}`);
      
      // Ensure audio file exists
      const audioExists = await this.checkFileExists(audioPath);
      if (!audioExists) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // Get audio file stats for duration calculation
      const audioStats = await fs.stat(audioPath);
      const audioBuffer = await fs.readFile(audioPath);
      
      // Estimate duration (rough calculation for WAV files)
      const estimatedDuration = this.estimateAudioDuration(audioBuffer);
      
      console.log(`📊 Audio file stats: ${audioStats.size} bytes, ~${estimatedDuration}s duration`);

      // Perform Speech-to-Text analysis
      const speechAnalysis = await this.performSpeechToText(audioPath);
      
      // Analyze audio quality
      const audioQuality = await this.analyzeAudioQuality(audioBuffer);
      
      // Detect audio events
      const audioEvents = await this.detectAudioEvents(audioBuffer, estimatedDuration);
      
      // Extract speaker information
      const { speakerCount, speakers } = this.extractSpeakerInfo(speechAnalysis);

      const result: AudioAnalysisResult = {
        transcript: speechAnalysis.transcript,
        confidence: speechAnalysis.confidence,
        speakerCount,
        speakers,
        audioEvents,
        audioQuality,
        languageCode: speechAnalysis.languageCode,
        duration: estimatedDuration
      };

      console.log(`✅ Audio analysis completed for segment ${segmentNumber}`);
      console.log(`📝 Transcript: "${result.transcript.substring(0, 100)}..."`);
      console.log(`🗣️ Speakers detected: ${speakerCount}`);
      
      return result;

    } catch (error) {
      console.error(`❌ Audio analysis failed for segment ${segmentNumber}:`, error);
      throw new Error(`Audio analysis failed: ${error}`);
    }
  }

  /**
   * Perform Google Speech-to-Text analysis
   */
  private async performSpeechToText(audioPath: string): Promise<{
    transcript: string;
    confidence: number;
    languageCode: string;
    words: any[];
    speakers: any[];
  }> {
    try {
      console.log('🎤 Running Speech-to-Text analysis...');
      
      const audioBytes = await fs.readFile(audioPath);

      const request = {
        audio: {
          content: audioBytes.toString('base64'),
        },
        config: {
          encoding: 'LINEAR16' as const,
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          enableSpeakerDiarization: true,
          diarizationConfig: {
            enableSpeakerDiarization: true,
            minSpeakerCount: 1,
            maxSpeakerCount: 6,
          },
          model: 'latest_short', // Optimized for short audio clips
        },
      };

      const [response] = await this.speechClient.recognize(request);
      
      if (!response.results || response.results.length === 0) {
        console.log('🔇 No speech detected in audio segment');
        return {
          transcript: '',
          confidence: 0,
          languageCode: 'en-US',
          words: [],
          speakers: []
        };
      }

      // Combine all transcripts
      let fullTranscript = '';
      let totalConfidence = 0;
      let wordCount = 0;
      const allWords: any[] = [];
      const speakers: any[] = [];

      response.results.forEach((result, resultIndex) => {
        if (result.alternatives && result.alternatives[0]) {
          const alternative = result.alternatives[0];
          fullTranscript += alternative.transcript + ' ';
          totalConfidence += alternative.confidence || 0;
          
          // Extract word-level information
          if (alternative.words) {
            alternative.words.forEach((word) => {
              allWords.push({
                word: word.word,
                startTime: word.startTime?.seconds || 0,
                endTime: word.endTime?.seconds || 0,
                speakerTag: word.speakerTag || 0
              });
              wordCount++;
            });
          }
        }
      });

      // Extract unique speakers
      const uniqueSpeakers = [...new Set(allWords.map(word => word.speakerTag))];
      uniqueSpeakers.forEach(speakerTag => {
        const speakerWords = allWords.filter(word => word.speakerTag === speakerTag);
        speakers.push({
          speakerTag,
          wordCount: speakerWords.length,
          words: speakerWords
        });
      });

      const averageConfidence = wordCount > 0 ? totalConfidence / response.results.length : 0;

      console.log(`✅ Speech-to-Text completed. Confidence: ${(averageConfidence * 100).toFixed(1)}%`);
      
      return {
        transcript: fullTranscript.trim(),
        confidence: averageConfidence,
        languageCode: 'en-US',
        words: allWords,
        speakers
      };

    } catch (error) {
      console.error('❌ Speech-to-Text analysis failed:', error);
      // Return empty result instead of throwing to allow other analysis to continue
      return {
        transcript: '',
        confidence: 0,
        languageCode: 'en-US',
        words: [],
        speakers: []
      };
    }
  }

  /**
   * Extract speaker information from speech analysis
   */
  private extractSpeakerInfo(speechAnalysis: any): { speakerCount: number; speakers: Speaker[] } {
    if (!speechAnalysis.speakers || speechAnalysis.speakers.length === 0) {
      return { speakerCount: 0, speakers: [] };
    }

    const speakers: Speaker[] = speechAnalysis.speakers.map((speaker: any, index: number) => {
      const speakerWords = speaker.words || [];
      const segments: SpeechSegment[] = [];
      
      // Group consecutive words into speech segments
      let currentSegment: SpeechSegment | null = null;
      
      speakerWords.forEach((word: any) => {
        if (!currentSegment) {
          currentSegment = {
            startTime: word.startTime,
            endTime: word.endTime,
            text: word.word,
            confidence: 1.0 // Default confidence for word-level
          };
        } else {
          // If words are close together (< 1 second gap), combine them
          if (word.startTime - currentSegment.endTime < 1.0) {
            currentSegment.endTime = word.endTime;
            currentSegment.text += ' ' + word.word;
          } else {
            // Save current segment and start new one
            segments.push(currentSegment);
            currentSegment = {
              startTime: word.startTime,
              endTime: word.endTime,
              text: word.word,
              confidence: 1.0
            };
          }
        }
      });
      
      // Add final segment
      if (currentSegment) {
        segments.push(currentSegment);
      }

      const totalSpeakingTime = segments.reduce((total, segment) => 
        total + (segment.endTime - segment.startTime), 0
      );

      return {
        speakerId: `speaker_${speaker.speakerTag || index}`,
        segments,
        totalSpeakingTime
      };
    });

    return {
      speakerCount: speakers.length,
      speakers
    };
  }

  /**
   * Analyze audio quality characteristics
   */
  private async analyzeAudioQuality(audioBuffer: Buffer): Promise<AudioQuality> {
    // Simple heuristic-based quality analysis
    // In a production system, you might use more sophisticated audio analysis libraries
    
    const fileSize = audioBuffer.length;
    const estimatedBitrate = fileSize / 5; // Rough estimate for 5-second audio
    
    let volume: AudioQuality['volume'] = 'medium';
    let clarity: AudioQuality['clarity'] = 'good';
    let backgroundNoise: AudioQuality['backgroundNoise'] = 'low';
    
    // Simple heuristics based on file size and estimated bitrate
    if (estimatedBitrate < 16000) {
      volume = 'low';
      clarity = 'poor';
    } else if (estimatedBitrate > 128000) {
      volume = 'high';
      clarity = 'excellent';
    }
    
    // Calculate overall score
    const volumeScore = { very_low: 20, low: 40, medium: 60, high: 80, very_high: 90 }[volume];
    const clarityScore = { poor: 25, fair: 50, good: 75, excellent: 100 }[clarity];
    const noiseScore = { none: 100, low: 80, medium: 60, high: 40 }[backgroundNoise];
    
    const overallScore = Math.round((volumeScore + clarityScore + noiseScore) / 3);
    
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
  private async detectAudioEvents(audioBuffer: Buffer, duration: number): Promise<AudioEvent[]> {
    const events: AudioEvent[] = [];
    
    // Simple silence detection based on file size
    const avgBytesPerSecond = audioBuffer.length / duration;
    const silenceThreshold = 1000; // Very rough threshold
    
    if (avgBytesPerSecond < silenceThreshold) {
      events.push({
        type: 'silence',
        startTime: 0,
        endTime: duration,
        confidence: 0.7
      });
    }
    
    // More sophisticated event detection would analyze audio frequencies,
    // amplitude patterns, etc. This is a simplified implementation.
    
    return events;
  }

  /**
   * Estimate audio duration from buffer (rough calculation for WAV)
   */
  private estimateAudioDuration(audioBuffer: Buffer): number {
    // For 16kHz, 16-bit, mono WAV: ~32,000 bytes per second
    // This is a rough estimate - in production you'd parse the WAV header
    const bytesPerSecond = 32000;
    return Math.max(1, audioBuffer.length / bytesPerSecond);
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
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`🧹 Cleaned up audio file: ${filePath}`);
      } catch (error) {
        console.warn(`⚠️ Failed to clean up ${filePath}:`, error);
      }
    }
  }
} 