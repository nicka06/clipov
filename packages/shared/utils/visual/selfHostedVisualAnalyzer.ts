import { Storage } from '@google-cloud/storage';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Import interfaces from existing visual analyzer
export interface VisualAnalysisResult {
  people: Person[];
  objects: DetectedObject[];
  activities: Activity[];
  sceneContext: SceneContext;
  visualFeatures: VisualFeatures;
  duration: number;
}

export interface Person {
  personId: string;
  totalVisibleTime: number;
  confidence: number;
  boundingBoxes: BoundingBox[];
}

export interface BoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
  timestamp: number;
}

export interface DetectedObject {
  name: string;
  category: string;
  confidence: number;
  totalVisibleTime: number;
  boundingBoxes: BoundingBox[];
}

export interface Activity {
  name: string;
  description: string;
  confidence: number;
  startTime: number;
  endTime: number;
}

export interface SceneContext {
  location: 'indoor' | 'outdoor' | 'studio' | 'office' | 'home' | 'unknown';
  setting: 'presentation' | 'meeting' | 'interview' | 'casual' | 'formal' | 'unknown';
  mood: 'professional' | 'casual' | 'energetic' | 'calm' | 'serious' | 'unknown';
}

export interface VisualFeatures {
  dominantColors: Color[];
  brightness: number; // 0-100
  contrast: number; // 0-100
  stability: number; // 0-100
}

export interface Color {
  red: number;
  green: number;
  blue: number;
  percentage: number;
}

export class SelfHostedVisualAnalyzer {
  private aiServiceUrl: string;
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'https://clipov-ai-service-775040410718.us-central1.run.app';
    this.storage = new Storage();
    this.bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GOOGLE_CLOUD_STORAGE_BUCKET || '';
    
    if (!this.aiServiceUrl) {
      throw new Error('❌ AI_SERVICE_URL environment variable not configured');
    }
    
    if (!this.bucketName) {
      throw new Error('❌ Google Cloud Storage bucket not configured. Set FIREBASE_STORAGE_BUCKET or GOOGLE_CLOUD_STORAGE_BUCKET environment variable.');
    }
    
    console.log(`🤖 Self-hosted visual analyzer initialized with service: ${this.aiServiceUrl}`);
  }

  /**
   * Analyze video segment for visual content, people, objects, and activities
   */
  async analyzeVideoSegment(
    cloudStoragePath: string,
    segmentNumber: number,
    videoId: string,
    userId: string
  ): Promise<VisualAnalysisResult> {
    try {
      console.log(`🎬 Starting self-hosted visual analysis for segment ${segmentNumber}`);
      console.log(`📂 Using Cloud Storage path: ${cloudStoragePath}`);
      
      // Download video segment from Cloud Storage to temporary file
      const tempVideoPath = await this.downloadSegmentFromStorage(cloudStoragePath, segmentNumber);
      
      try {
        // Call self-hosted AI service for visual analysis
        const analysisResult = await this.callVisualAnalysisService(tempVideoPath);
        
        // Analyze scene context from detected data
        const sceneContext = this.analyzeSceneContext(analysisResult.objects, analysisResult.activities);
        
        // Extract visual features (simplified)
        const visualFeatures = this.extractVisualFeatures();

        const result: VisualAnalysisResult = {
          people: analysisResult.people,
          objects: analysisResult.objects,
          activities: analysisResult.activities,
          sceneContext,
          visualFeatures,
          duration: 30.0 // Match 30-second segments
        };

        console.log(`✅ Self-hosted visual analysis completed for segment ${segmentNumber}`);
        console.log(`👥 People detected: ${result.people.length}`);
        console.log(`📦 Objects detected: ${result.objects.length}`);
        console.log(`🎭 Activities detected: ${result.activities.length}`);
        
        return result;

      } finally {
        // Clean up temporary file
        try {
          await fs.unlink(tempVideoPath);
          console.log(`🗑️ Cleaned up temp file: ${tempVideoPath}`);
        } catch (error) {
          console.warn(`⚠️ Failed to clean up temp file: ${tempVideoPath}`, error);
        }
      }

    } catch (error) {
      console.error(`❌ Self-hosted visual analysis failed for segment ${segmentNumber}:`, error);
      throw new Error(`Self-hosted visual analysis failed for Cloud Storage path ${cloudStoragePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download video segment from Cloud Storage to temporary file
   */
  private async downloadSegmentFromStorage(cloudStoragePath: string, segmentNumber: number): Promise<string> {
    try {
      console.log(`📥 Downloading segment from Cloud Storage: ${cloudStoragePath}`);
      
      const file = this.storage.bucket(this.bucketName).file(cloudStoragePath);
      
             // Create temporary file with unique name to avoid race conditions
       const tempVideoPath = `/tmp/segment_${segmentNumber}_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
      
      // Download to temporary file
      await file.download({ destination: tempVideoPath });
      
      // Verify file was downloaded successfully
      try {
        const stats = await fs.stat(tempVideoPath);
        console.log(`✅ Segment downloaded to: ${tempVideoPath} (${stats.size} bytes)`);
      } catch (statError) {
        throw new Error(`Downloaded file verification failed: ${statError}`);
      }
      
      return tempVideoPath;
      
    } catch (error) {
      console.error('❌ Failed to download segment from Cloud Storage:', error);
      throw new Error(`Failed to download segment: ${error}`);
    }
  }

  /**
   * Call the self-hosted AI service for visual analysis with retry logic
   */
  private async callVisualAnalysisService(videoPath: string): Promise<{
    people: Person[];
    objects: DetectedObject[];
    activities: Activity[];
  }> {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🌐 Calling self-hosted visual analysis service at: ${this.aiServiceUrl}/analyze/visual/analyze-video-segment (attempt ${attempt}/${maxRetries})`);
        
        // Verify file exists before reading
        try {
          await fs.access(videoPath);
        } catch (accessError) {
          throw new Error(`Video file not accessible: ${videoPath} - ${accessError}`);
        }
        
        // Create form data with lower confidence threshold for better detection
        const formData = new FormData();
        const videoBuffer = await fs.readFile(videoPath);
        formData.append('file', videoBuffer, {
          filename: 'segment.mp4',
          contentType: 'video/mp4'
        });
        
        // Add parameters for better detection
        formData.append('extract_frames', '8');  // More frames for better detection
        
        // Use URL parameters for confidence threshold
        const urlParams = new URLSearchParams({
          confidence_threshold: '0.25'  // Lower threshold for mobile video
        });

        // Call the AI service with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout (longer for video processing)

        const response = await fetch(`${this.aiServiceUrl}/analyze/visual/analyze-video-segment?${urlParams}`, {
          method: 'POST',
          body: formData,
          headers: formData.getHeaders(),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ AI service error response: ${response.status} ${response.statusText} - ${errorText}`);
          
          // Check if this is a retryable error
          if (this.isRetryableError(response.status, errorText)) {
            if (attempt < maxRetries) {
              const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
              console.log(`🔄 Retryable error detected. Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          
          throw new Error(`AI service responded with status ${response.status}: ${response.statusText}`);
        }

        const result = await response.json() as any;
        console.log(`📊 AI service response: ${JSON.stringify(result).substring(0, 200)}...`);
        
        console.log(`✅ Self-hosted visual analysis completed on attempt ${attempt}`);
        console.log(`👥 Raw people detected: ${result.people?.length || 0}`);
        console.log(`📦 Raw objects detected: ${result.objects?.length || 0}`);
        console.log(`🎭 Raw activities detected: ${result.activities?.length || 0}`);
        
        // Transform the result to match our interface
        return {
          people: this.transformPeopleResults(result.people || []),
          objects: this.transformObjectResults(result.objects || []),
          activities: this.transformActivityResults(result.activities || [])
        };

      } catch (error) {
        console.error(`❌ Self-hosted visual analysis attempt ${attempt}/${maxRetries} failed:`, error);
        
        // Check if this is a retryable error
        if (this.isRetryableNetworkError(error) && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`🔄 Network error detected. Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If this is the last attempt or non-retryable error, throw
        if (attempt === maxRetries) {
          throw new Error(`Self-hosted visual analysis failed after ${maxRetries} attempts: ${error}`);
        }
      }
    }
    
    throw new Error('Visual analysis failed - should not reach here');
  }

  /**
   * Check if an HTTP error is retryable
   */
  private isRetryableError(status: number, errorText: string): boolean {
    // Retryable HTTP status codes
    if ([500, 502, 503, 504, 429].includes(status)) {
      return true;
    }
    
    // Check for Cloud Run specific error messages
    if (errorText.includes('server encountered an error') ||
        errorText.includes('try again in 30 seconds') ||
        errorText.includes('temporarily unavailable') ||
        errorText.includes('timeout')) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if a network error is retryable
   */
  private isRetryableNetworkError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    
    // Network/timeout related errors
    return errorMessage.includes('timeout') ||
           errorMessage.includes('network') ||
           errorMessage.includes('econnreset') ||
           errorMessage.includes('enotfound') ||
           errorMessage.includes('aborted') ||
           errorMessage.includes('fetch');
  }

  /**
   * Transform people detection results to our format
   */
  private transformPeopleResults(people: any[]): Person[] {
    return people.map((person: any, index: number) => {
      const boundingBoxes: BoundingBox[] = person.detections?.map((detection: any) => ({
        left: detection.bbox?.x || 0,
        top: detection.bbox?.y || 0,
        width: detection.bbox?.width || 0,
        height: detection.bbox?.height || 0,
        timestamp: detection.timestamp || 0
      })) || [];

      return {
        personId: `person_${index + 1}`,
        totalVisibleTime: person.total_visible_time || 30.0,
        confidence: person.confidence || 0.8,
        boundingBoxes
      };
    });
  }

  /**
   * Transform object detection results to our format
   */
  private transformObjectResults(objects: any[]): DetectedObject[] {
    return objects.map((obj: any) => {
      const boundingBoxes: BoundingBox[] = obj.detections?.map((detection: any) => ({
        left: detection.bbox?.x || 0,
        top: detection.bbox?.y || 0,
        width: detection.bbox?.width || 0,
        height: detection.bbox?.height || 0,
        timestamp: detection.timestamp || 0
      })) || [];

      return {
        name: obj.name || 'unknown',
        category: this.categorizeObject(obj.name || 'unknown'),
        confidence: obj.confidence || 0.8,
        totalVisibleTime: obj.total_visible_time || 30.0,
        boundingBoxes
      };
    });
  }

  /**
   * Transform activity detection results to our format
   */
  private transformActivityResults(activities: any[]): Activity[] {
    return activities.map((activity: any) => ({
      name: activity.name || 'unknown',
      description: activity.description || activity.name || 'unknown activity',
      confidence: activity.confidence || 0.8,
      startTime: activity.start_time || 0,
      endTime: activity.end_time || 30
    }));
  }

  /**
   * Categorize detected objects
   */
  private categorizeObject(objectName: string): string {
    const objectName_lower = objectName.toLowerCase();
    
    // Furniture & Interior
    if (['chair', 'table', 'desk', 'sofa', 'couch', 'bed', 'cabinet'].some(item => objectName_lower.includes(item))) {
      return 'furniture';
    }
    
    // Technology
    if (['computer', 'laptop', 'phone', 'monitor', 'screen', 'keyboard', 'mouse'].some(item => objectName_lower.includes(item))) {
      return 'technology';
    }
    
    // Clothing & Accessories
    if (['shirt', 'jacket', 'hat', 'glasses', 'bag', 'backpack'].some(item => objectName_lower.includes(item))) {
      return 'clothing';
    }
    
    // Kitchen & Food
    if (['cup', 'bottle', 'food', 'plate', 'bowl', 'kitchen', 'cooking'].some(item => objectName_lower.includes(item))) {
      return 'kitchen';
    }
    
    return 'general';
  }

  /**
   * Analyze scene context based on detected objects and activities
   */
  private analyzeSceneContext(objects: DetectedObject[], activities: Activity[]): SceneContext {
    let location: SceneContext['location'] = 'unknown';
    let setting: SceneContext['setting'] = 'unknown';
    let mood: SceneContext['mood'] = 'unknown';

    // Determine location based on objects
    const objectNames = objects.map(obj => obj.name.toLowerCase());
    
    if (objectNames.some(name => ['kitchen', 'cooking', 'food', 'dining'].some(term => name.includes(term)))) {
      location = 'home';
    } else if (objectNames.some(name => ['computer', 'monitor', 'desk', 'office'].some(term => name.includes(term)))) {
      location = 'office';
    } else if (objectNames.some(name => ['outdoor', 'tree', 'sky', 'building'].some(term => name.includes(term)))) {
      location = 'outdoor';
    } else if (objectNames.some(name => ['couch', 'tv', 'home', 'living'].some(term => name.includes(term)))) {
      location = 'home';
    } else {
      location = 'indoor'; // Default assumption
    }

    // Determine setting based on activities
    const activityNames = activities.map(activity => activity.name.toLowerCase());
    
    if (activityNames.some(name => ['presentation', 'presenting', 'teaching'].some(term => name.includes(term)))) {
      setting = 'presentation';
    } else if (activityNames.some(name => ['meeting', 'discussion', 'talking'].some(term => name.includes(term)))) {
      setting = 'meeting';
    } else if (activityNames.some(name => ['interview', 'questioning'].some(term => name.includes(term)))) {
      setting = 'interview';
    } else {
      setting = 'casual';
    }

    // Determine mood (simplified)
    if (setting === 'presentation' || setting === 'meeting') {
      mood = 'professional';
    } else if (setting === 'interview') {
      mood = 'serious';
    } else {
      mood = 'casual';
    }

    return { location, setting, mood };
  }

  /**
   * Extract visual features (simplified implementation)
   */
  private extractVisualFeatures(): VisualFeatures {
    // In a real implementation, this would analyze the video frames
    // For now, returning placeholder data
    return {
      dominantColors: [
        { red: 120, green: 150, blue: 180, percentage: 35 },
        { red: 200, green: 180, blue: 160, percentage: 25 },
        { red: 80, green: 100, blue: 120, percentage: 20 }
      ],
      brightness: 75,
      contrast: 65,
      stability: 85
    };
  }
} 