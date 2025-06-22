// CloudTasksClient will be dynamically imported to avoid build issues

export interface AnalysisTaskPayload {
  videoId: string;
  userId: string;
  priority?: 'high' | 'normal' | 'low';
  delaySeconds?: number;
}

export class CloudTasksService {
  private client: any; // Will be initialized with CloudTasksClient
  private projectId: string;
  private location: string;
  private queueName: string;
  private serviceUrl: string;

  constructor() {
    // Client will be initialized in the first method call
    this.projectId = (typeof process !== 'undefined' ? process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.FIREBASE_PROJECT_ID : undefined) || '';
    this.location = (typeof process !== 'undefined' ? process.env.GOOGLE_CLOUD_REGION : undefined) || 'us-central1';
    this.queueName = 'video-analysis-queue';
    this.serviceUrl = (typeof process !== 'undefined' ? process.env.NEXTAUTH_URL : undefined) || 'http://localhost:3000';
    
    if (!this.projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID or FIREBASE_PROJECT_ID environment variable is required');
    }
  }

  /**
   * Initialize the CloudTasksClient if not already done
   */
  private async initializeClient() {
    if (!this.client) {
      const { CloudTasksClient } = await import('@google-cloud/tasks');
      this.client = new CloudTasksClient();
    }
  }

  /**
   * Queue a video analysis task
   */
  async queueAnalysisTask(payload: AnalysisTaskPayload): Promise<string> {
    try {
      await this.initializeClient();
      const parent = this.client.queuePath(this.projectId, this.location, this.queueName);
      
      // Calculate schedule time if delay is specified
      let scheduleTime;
      if (payload.delaySeconds && payload.delaySeconds > 0) {
        scheduleTime = {
          seconds: Math.floor(Date.now() / 1000) + payload.delaySeconds,
        };
      }

      const task = {
        httpRequest: {
          httpMethod: 'POST' as const,
          url: `${this.serviceUrl}/api/analysis/trigger`,
          headers: {
            'Content-Type': 'application/json',
          },
          body: typeof Buffer !== 'undefined' 
            ? Buffer.from(JSON.stringify({
                videoId: payload.videoId,
                userId: payload.userId,
                queuedAt: new Date().toISOString(),
                priority: payload.priority || 'normal'
              }))
            : new TextEncoder().encode(JSON.stringify({
                videoId: payload.videoId,
                userId: payload.userId,
                queuedAt: new Date().toISOString(),
                priority: payload.priority || 'normal'
              })),
        },
        scheduleTime,
      };

      console.log(`Queueing analysis task for video ${payload.videoId}`);
      console.log('Task details:', {
        url: task.httpRequest.url,
        videoId: payload.videoId,
        userId: payload.userId,
        delaySeconds: payload.delaySeconds,
        priority: payload.priority
      });

      const [response] = await this.client.createTask({ parent, task });
      
      const taskName = response.name || 'unknown';
      console.log(`Analysis task queued successfully: ${taskName}`);
      
      return taskName;
    } catch (error) {
      console.error('Error queueing analysis task:', error);
      throw new Error(`Failed to queue analysis task: ${error}`);
    }
  }

  /**
   * Queue multiple analysis tasks with batch processing
   */
  async queueBatchAnalysisTasks(payloads: AnalysisTaskPayload[]): Promise<string[]> {
    try {
      console.log(`Queueing ${payloads.length} analysis tasks`);
      
      const taskPromises = payloads.map(payload => this.queueAnalysisTask(payload));
      const taskNames = await Promise.all(taskPromises);
      
      console.log(`Successfully queued ${taskNames.length} analysis tasks`);
      return taskNames;
    } catch (error) {
      console.error('Error queueing batch analysis tasks:', error);
      throw new Error(`Failed to queue batch analysis tasks: ${error}`);
    }
  }

  /**
   * Get task queue statistics
   */
  async getQueueStats(): Promise<{
    pendingTasks: number;
    dispatchedTasks: number;
    succeededTasks: number;
    failedTasks: number;
  }> {
    try {
      await this.initializeClient();
      const queuePath = this.client.queuePath(this.projectId, this.location, this.queueName);
      const [queue] = await this.client.getQueue({ name: queuePath });
      
      return {
        pendingTasks: (queue as any).stats?.pendingTasks || 0,
        dispatchedTasks: (queue as any).stats?.dispatchedTasks || 0,
        succeededTasks: (queue as any).stats?.succeededTasks || 0,
        failedTasks: (queue as any).stats?.failedTasks || 0,
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {
        pendingTasks: 0,
        dispatchedTasks: 0,
        succeededTasks: 0,
        failedTasks: 0,
      };
    }
  }

  /**
   * Pause the analysis queue (for maintenance)
   */
  async pauseQueue(): Promise<void> {
    try {
      await this.initializeClient();
      const queuePath = this.client.queuePath(this.projectId, this.location, this.queueName);
      await this.client.pauseQueue({ name: queuePath });
      console.log('Analysis queue paused');
    } catch (error) {
      console.error('Error pausing queue:', error);
      throw new Error(`Failed to pause queue: ${error}`);
    }
  }

  /**
   * Resume the analysis queue
   */
  async resumeQueue(): Promise<void> {
    try {
      await this.initializeClient();
      const queuePath = this.client.queuePath(this.projectId, this.location, this.queueName);
      await this.client.resumeQueue({ name: queuePath });
      console.log('Analysis queue resumed');
    } catch (error) {
      console.error('Error resuming queue:', error);
      throw new Error(`Failed to resume queue: ${error}`);
    }
  }

  /**
   * Purge all tasks from the queue (use with caution)
   */
  async purgeQueue(): Promise<void> {
    try {
      await this.initializeClient();
      const queuePath = this.client.queuePath(this.projectId, this.location, this.queueName);
      await this.client.purgeQueue({ name: queuePath });
      console.log('Analysis queue purged');
    } catch (error) {
      console.error('Error purging queue:', error);
      throw new Error(`Failed to purge queue: ${error}`);
    }
  }

  /**
   * Create the analysis queue if it doesn't exist
   */
  async createQueue(): Promise<void> {
    try {
      await this.initializeClient();
      const parent = this.client.locationPath(this.projectId, this.location);
      const queuePath = this.client.queuePath(this.projectId, this.location, this.queueName);
      
      // Check if queue already exists
      try {
        await this.client.getQueue({ name: queuePath });
        console.log('Analysis queue already exists');
        return;
      } catch (error) {
        // Queue doesn't exist, create it
      }
      
      const queue = {
        name: queuePath,
        retryConfig: {
          maxAttempts: 3,
          maxRetryDuration: { seconds: 3600 }, // 1 hour
          minBackoff: { seconds: 10 },
          maxBackoff: { seconds: 300 }, // 5 minutes
        },
        rateLimits: {
          maxDispatchesPerSecond: 10, // Adjust based on your processing capacity
          maxBurstSize: 100,
          maxConcurrentDispatches: 50,
        },
      };

      await this.client.createQueue({ parent, queue });
      console.log('Analysis queue created successfully');
    } catch (error) {
      console.error('Error creating queue:', error);
      throw new Error(`Failed to create queue: ${error}`);
    }
  }
} 