// Supported video file types
export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/webm',
  'video/x-ms-wmv', // .wmv
];

// File size limits
export const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
export const MIN_FILE_SIZE = 1024; // 1KB

// Upload session expiration (30 days)
export const UPLOAD_SESSION_EXPIRY_DAYS = 30;

// Signed URL expiration (1 hour)
export const SIGNED_URL_EXPIRY_HOURS = 1; 