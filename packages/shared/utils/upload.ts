/**
 * Calculate optimal chunk size based on file size
 * @param fileSize - Total file size in bytes
 * @returns Chunk size in bytes
 */
export function calculateChunkSize(fileSize: number): number {
  if (fileSize < 1024 * 1024 * 1024) { // < 1GB
    return 5 * 1024 * 1024; // 5MB chunks
  } else {
    return 10 * 1024 * 1024; // 10MB chunks for larger files
  }
}

/**
 * Format file size to human readable string
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 GB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generate chunk path for Cloud Storage
 * @param userId - User ID
 * @param sessionId - Upload session ID
 * @param chunkIndex - Chunk index (0-based)
 * @returns Cloud Storage path for the chunk
 */
export function generateChunkPath(userId: string, sessionId: string, chunkIndex: number): string {
  const paddedIndex = String(chunkIndex).padStart(3, '0');
  return `uploads/${userId}/${sessionId}/chunk_${paddedIndex}`;
}

/**
 * Generate final video path for Cloud Storage
 * @param userId - User ID
 * @param videoId - Video ID
 * @param fileName - Original file name
 * @returns Cloud Storage path for the final video
 */
export function generateVideoPath(userId: string, videoId: string, fileName: string): string {
  const extension = fileName.split('.').pop() || 'mp4';
  return `videos/${userId}/${videoId}.${extension}`;
} 