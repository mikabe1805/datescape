import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

// File size limits (in bytes)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB for videos

// Supported file types
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export async function uploadMediaFiles(uid, mediaFiles) {
  const urls = [];

  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    if (!file) continue;

    // Validate file type
    const isValidImage = SUPPORTED_IMAGE_TYPES.includes(file.type);
    const isValidVideo = SUPPORTED_VIDEO_TYPES.includes(file.type);
    
    if (!isValidImage && !isValidVideo) {
      throw new Error(`Unsupported file type: ${file.type}. Please use JPEG, PNG, WebP, MP4, WebM, or QuickTime files.`);
    }

    // Validate file size
    const maxSize = isValidVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      throw new Error(`File too large: ${file.name}. Maximum size is ${maxSizeMB}MB.`);
    }

    try {
      const fileRef = ref(storage, `userMedia/${uid}/media_${i}_${file.name}`);
      
      // Upload with progress tracking
      const uploadTask = uploadBytesResumable(fileRef, file);
      
      // Wait for upload to complete
      await uploadTask;
      
      const downloadURL = await getDownloadURL(fileRef);
      urls.push(downloadURL);
      
      console.log(`✅ Uploaded: ${file.name}`);
    } catch (error) {
      console.error(`❌ Upload failed for ${file.name}:`, error);
      
      if (error.code === 'storage/unauthorized') {
        throw new Error('Upload failed: Unauthorized. Please try again.');
      } else if (error.code === 'storage/retry-limit-exceeded') {
        throw new Error('Upload failed: Network timeout. Please try again with a smaller file or better connection.');
      } else if (error.code === 'storage/quota-exceeded') {
        throw new Error('Upload failed: Storage quota exceeded. Please contact support.');
      } else {
        throw new Error(`Upload failed: ${error.message}`);
      }
    }
  }

  return urls;
}
