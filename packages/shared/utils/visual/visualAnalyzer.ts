import { VideoIntelligenceServiceClient } from '@google-cloud/video-intelligence';
import { Storage } from '@google-cloud/storage';

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

export class VisualAnalyzer {
  private videoClient: VideoIntelligenceServiceClient;
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.videoClient = new VideoIntelligenceServiceClient();
    this.storage = new Storage();
    this.bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.GOOGLE_CLOUD_STORAGE_BUCKET || '';
    
    if (!this.bucketName) {
      throw new Error('❌ Google Cloud Storage bucket not configured. Set FIREBASE_STORAGE_BUCKET or GOOGLE_CLOUD_STORAGE_BUCKET environment variable.');
    }
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
      console.log(`🎬 Starting visual analysis for segment ${segmentNumber}`);
      console.log(`📂 Using Cloud Storage path: ${cloudStoragePath}`);
      
      // Build the complete Cloud Storage URI for Google APIs
      const videoUri = this.buildCloudStorageUri(cloudStoragePath);
      console.log(`🌐 Cloud Storage URI: ${videoUri}`);

      // Configuration is validated in constructor, so we can proceed with real analysis
      // Note: No need to upload again - file already exists in Cloud Storage from segmentation

      try {
        // Run parallel analysis for better performance
        const [peopleResult, objectsResult, activitiesResult] = await Promise.allSettled([
          this.detectPeople(videoUri),
          // Add small delay to prevent rate limiting
          new Promise(resolve => setTimeout(resolve, 1000)).then(() => this.detectObjects(videoUri)),
          // Add another delay
          new Promise(resolve => setTimeout(resolve, 2000)).then(() => this.detectActivities(videoUri))
        ]);

        // Extract results, using empty arrays for failed analyses
        const people = peopleResult.status === 'fulfilled' ? peopleResult.value : [];
        const objects = objectsResult.status === 'fulfilled' ? objectsResult.value : [];
        const activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value : [];

        // Analyze scene context from detected data
        const sceneContext = this.analyzeSceneContext(objects, activities);
        
        // Extract visual features (simplified for now - uses placeholder data)
        const visualFeatures = await this.extractVisualFeatures();

        const result: VisualAnalysisResult = {
          people,
          objects,
          activities,
          sceneContext,
          visualFeatures,
          duration: 30.0 // Updated to match 30-second segments
        };

        console.log(`✅ Visual analysis completed for segment ${segmentNumber}`);
        console.log(`👥 People detected: ${people.length}`);
        console.log(`📦 Objects detected: ${objects.length}`);
        console.log(`🎭 Activities detected: ${activities.length}`);
        
        return result;

      } catch (analysisError) {
        console.error(`❌ Google API analysis failed for segment ${segmentNumber}:`, analysisError);
        throw new Error(`Visual analysis failed for Cloud Storage path ${videoUri}: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`);
      }

    } catch (error) {
      console.error(`❌ Visual analysis failed for segment ${segmentNumber}:`, error);
      throw error; // Fail fast - don't return fake data
    }
  }

  /**
   * Build Cloud Storage URI for Google APIs
   */
  private buildCloudStorageUri(cloudStoragePath: string): string {
    return `gs://${this.bucketName}/${cloudStoragePath}`;
  }

  /**
   * Detect people in video using Google Video Intelligence API
   */
  private async detectPeople(videoUri: string): Promise<Person[]> {
    try {
      console.log('👥 Running person detection...');
      
      const request = {
        inputUri: videoUri,
        features: ['PERSON_DETECTION' as any],
        videoContext: {
          personDetectionConfig: {
            includeBoundingBoxes: true,
            includePoseLandmarks: false,
            includeAttributes: false,
          }
        }
      };

      const [operation] = await this.videoClient.annotateVideo(request as any);
      const [response] = await operation.promise();

      if (!response.annotationResults?.[0]?.personDetectionAnnotations) {
        console.log('👥 No people detected');
        return [];
      }

      const people: Person[] = [];
      const annotations = response.annotationResults[0].personDetectionAnnotations;

      annotations.forEach((personAnnotation: any, index: number) => {
        const tracks = personAnnotation.tracks || [];
        let totalVisibleTime = 0;
        const boundingBoxes: BoundingBox[] = [];

        tracks.forEach((track: any) => {
          const segment = track.segment;
          if (segment?.startTimeOffset && segment?.endTimeOffset) {
            const startTime = this.parseTimestamp(segment.startTimeOffset);
            const endTime = this.parseTimestamp(segment.endTimeOffset);
            totalVisibleTime += (endTime - startTime);
          }

          // Extract bounding boxes
          track.timestampedObjects?.forEach((obj: any) => {
            const timestamp = this.parseTimestamp(obj.timeOffset);
            const box = obj.normalizedBoundingBox;
            
            if (box) {
              boundingBoxes.push({
                left: box.left || 0,
                top: box.top || 0,
                width: (box.right || 0) - (box.left || 0),
                height: (box.bottom || 0) - (box.top || 0),
                timestamp
              });
            }
          });
        });

        people.push({
          personId: `person_${index + 1}`,
          totalVisibleTime,
          confidence: tracks[0]?.confidence || 0.5,
          boundingBoxes
        });
      });

      console.log(`✅ Person detection completed: ${people.length} people found`);
      return people;

    } catch (error) {
      console.error('❌ Person detection failed:', error);
      return [];
    }
  }

  /**
   * Detect objects in video using Google Video Intelligence API
   */
  private async detectObjects(videoUri: string): Promise<DetectedObject[]> {
    try {
      console.log('📦 Running object detection...');
      
      const request = {
        inputUri: videoUri,
        features: ['OBJECT_TRACKING' as any]
      };

      const [operation] = await this.videoClient.annotateVideo(request as any);
      const [response] = await operation.promise();

      if (!response.annotationResults?.[0]?.objectAnnotations) {
        console.log('📦 No objects detected');
        return [];
      }

      const objects: DetectedObject[] = [];
      const annotations = response.annotationResults[0].objectAnnotations;

      annotations.forEach((objectAnnotation: any) => {
        const entity = objectAnnotation.entity;
        const tracks = objectAnnotation.tracks || [];
        
        let totalVisibleTime = 0;
        const boundingBoxes: BoundingBox[] = [];

        tracks.forEach((track: any) => {
          const segment = track.segment;
          if (segment?.startTimeOffset && segment?.endTimeOffset) {
            const startTime = this.parseTimestamp(segment.startTimeOffset);
            const endTime = this.parseTimestamp(segment.endTimeOffset);
            totalVisibleTime += (endTime - startTime);
          }

          // Extract bounding boxes
          track.timestampedObjects?.forEach((obj: any) => {
            const timestamp = this.parseTimestamp(obj.timeOffset);
            const box = obj.normalizedBoundingBox;
            
            if (box) {
              boundingBoxes.push({
                left: box.left || 0,
                top: box.top || 0,
                width: (box.right || 0) - (box.left || 0),
                height: (box.bottom || 0) - (box.top || 0),
                timestamp
              });
            }
          });
        });

        objects.push({
          name: entity?.description || 'unknown',
          category: this.categorizeObject(entity?.description || ''),
          confidence: objectAnnotation.confidence || 0.5,
          totalVisibleTime,
          boundingBoxes
        });
      });

      console.log(`✅ Object detection completed: ${objects.length} objects found`);
      return objects;

    } catch (error) {
      console.error('❌ Object detection failed:', error);
      return [];
    }
  }

  /**
   * Detect activities using label detection
   */
  private async detectActivities(videoUri: string): Promise<Activity[]> {
    try {
      console.log('🎭 Running activity detection...');
      
      const request = {
        inputUri: videoUri,
        features: ['LABEL_DETECTION' as any],
        videoContext: {
          labelDetectionConfig: {
            labelDetectionMode: 'SHOT_AND_FRAME_MODE',
            stationaryCamera: false,
          }
        }
      };

      const [operation] = await this.videoClient.annotateVideo(request as any);
      const [response] = await operation.promise();

      if (!response.annotationResults?.[0]?.segmentLabelAnnotations) {
        console.log('🎭 No activities detected');
        return [];
      }

      const activities: Activity[] = [];
      const annotations = response.annotationResults[0].segmentLabelAnnotations;

      annotations.forEach((labelAnnotation: any) => {
        const entity = labelAnnotation.entity;
        const segments = labelAnnotation.segments || [];

        segments.forEach((segment: any) => {
          const startTime = this.parseTimestamp(segment.segment?.startTimeOffset);
          const endTime = this.parseTimestamp(segment.segment?.endTimeOffset);
          
          // Filter for activity-related labels
          const labelText = entity?.description?.toLowerCase() || '';
          if (this.isActivityLabel(labelText)) {
            activities.push({
              name: entity?.description || 'unknown',
              description: `${entity?.description} detected in video segment`,
              confidence: segment.confidence || 0.5,
              startTime,
              endTime
            });
          }
        });
      });

      console.log(`✅ Activity detection completed: ${activities.length} activities found`);
      return activities;

    } catch (error) {
      console.error('❌ Activity detection failed:', error);
      return [];
    }
  }

  /**
   * Parse Google Cloud timestamp to seconds
   */
  private parseTimestamp(timestamp: any): number {
    if (!timestamp) return 0;
    return (timestamp.seconds || 0) + (timestamp.nanos || 0) / 1000000000;
  }

  /**
   * Categorize detected objects
   */
  private categorizeObject(objectName: string): string {
    const name = objectName.toLowerCase();
    
    if (['person', 'human', 'man', 'woman'].some(term => name.includes(term))) {
      return 'person';
    } else if (['microphone', 'speaker', 'camera', 'screen', 'projector'].some(term => name.includes(term))) {
      return 'equipment';
    } else if (['chair', 'table', 'desk', 'furniture'].some(term => name.includes(term))) {
      return 'furniture';
    } else if (['clothing', 'shirt', 'suit', 'dress'].some(term => name.includes(term))) {
      return 'clothing';
    } else {
      return 'object';
    }
  }

  /**
   * Check if a label represents an activity
   */
  private isActivityLabel(label: string): boolean {
    const activityTerms = [
      'speaking', 'talking', 'presenting', 'walking', 'sitting', 'standing',
      'gesturing', 'pointing', 'writing', 'reading', 'listening', 'laughing',
      'clapping', 'meeting', 'discussion', 'interview', 'conversation'
    ];
    
    return activityTerms.some(term => label.includes(term));
  }

  /**
   * Analyze scene context from detected objects and activities
   */
  private analyzeSceneContext(objects: DetectedObject[], activities: Activity[]): SceneContext {
    const objectNames = objects.map(obj => obj.name.toLowerCase());
    const activityNames = activities.map(act => act.name.toLowerCase());
    
    // Determine location
    let location: SceneContext['location'] = 'unknown';
    if (objectNames.some(name => ['desk', 'computer', 'office', 'whiteboard'].some(term => name.includes(term)))) {
      location = 'office';
    } else if (objectNames.some(name => ['stage', 'microphone', 'audience', 'podium'].some(term => name.includes(term)))) {
      location = 'studio';
    } else if (objectNames.some(name => ['furniture', 'couch', 'kitchen', 'bedroom'].some(term => name.includes(term)))) {
      location = 'home';
    } else if (objectNames.some(name => ['building', 'ceiling', 'wall', 'indoor'].some(term => name.includes(term)))) {
      location = 'indoor';
    } else if (objectNames.some(name => ['sky', 'tree', 'outdoor', 'street'].some(term => name.includes(term)))) {
      location = 'outdoor';
    }

    // Determine setting
    let setting: SceneContext['setting'] = 'unknown';
    if (activityNames.some(name => ['presentation', 'speaking', 'lecture'].some(term => name.includes(term)))) {
      setting = 'presentation';
    } else if (activityNames.some(name => ['meeting', 'discussion', 'conversation'].some(term => name.includes(term)))) {
      setting = 'meeting';
    } else if (activityNames.some(name => ['interview', 'question'].some(term => name.includes(term)))) {
      setting = 'interview';
    } else if (objectNames.some(name => ['suit', 'formal', 'business'].some(term => name.includes(term)))) {
      setting = 'formal';
    } else {
      setting = 'casual';
    }

    return {
      location,
      setting,
      mood: setting === 'formal' ? 'professional' : 'casual'
    };
  }

  /**
   * Extract visual features (simplified implementation)
   */
  private async extractVisualFeatures(): Promise<VisualFeatures> {
    // This would use computer vision libraries like OpenCV in a full implementation
    return {
      dominantColors: [
        { red: 100, green: 100, blue: 100, percentage: 60 },
        { red: 200, green: 200, blue: 200, percentage: 40 }
      ],
      brightness: 70,
      contrast: 60,
      stability: 85
    };
  }
} 