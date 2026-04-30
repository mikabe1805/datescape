import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const SUPPORTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const PER_FILE_TIMEOUT_MS = 60_000;

function classifyFile(file) {
  const isImage = SUPPORTED_IMAGE_TYPES.includes(file.type);
  const isVideo = SUPPORTED_VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    return { ok: false, reason: `Unsupported file type: ${file.type}.` };
  }
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    return { ok: false, reason: `File too large. Max ${maxSize / (1024 * 1024)}MB.` };
  }
  return { ok: true };
}

function uploadOneWithTimeout(uid, file, index) {
  return new Promise((resolve, reject) => {
    const path = `userMedia/${uid}/media_${index}_${Date.now()}_${file.name}`;
    const fileRef = ref(storage, path);
    const task = uploadBytesResumable(fileRef, file, { contentType: file.type });

    const timeoutId = setTimeout(() => {
      try {
        task.cancel();
      } catch {}
      reject(new Error(`Upload timed out after ${PER_FILE_TIMEOUT_MS / 1000}s.`));
    }, PER_FILE_TIMEOUT_MS);

    task.on(
      "state_changed",
      null,
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      },
      async () => {
        clearTimeout(timeoutId);
        try {
          const url = await getDownloadURL(fileRef);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// Upload media files. Idempotent per-call. Returns:
//   { urls: string[], errors: { index, name, reason }[] }
// Caller decides what to do if errors are present (retry, skip, etc.).
export async function uploadMediaFiles(uid, mediaFiles, { onProgress } = {}) {
  const urls = [];
  const errors = [];

  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    if (!file) continue;

    // Already a string URL? (e.g. previously uploaded; pass-through.)
    if (typeof file === "string") {
      urls.push(file);
      continue;
    }

    const check = classifyFile(file);
    if (!check.ok) {
      errors.push({ index: i, name: file.name, reason: check.reason });
      continue;
    }

    onProgress?.({ index: i, total: mediaFiles.length, name: file.name, phase: "start" });

    try {
      const url = await uploadOneWithTimeout(uid, file, i);
      urls.push(url);
      onProgress?.({ index: i, total: mediaFiles.length, name: file.name, phase: "done" });
    } catch (err) {
      const reason = friendlyError(err);
      errors.push({ index: i, name: file.name, reason });
      onProgress?.({ index: i, total: mediaFiles.length, name: file.name, phase: "error", reason });
    }
  }

  return { urls, errors };
}

function friendlyError(err) {
  if (!err) return "Unknown upload error.";
  const code = err.code || "";
  if (code === "storage/unauthorized") {
    return "Storage rejected the upload (unauthorized). Storage rules may need to allow authenticated writes.";
  }
  if (code === "storage/canceled") return "Upload timed out.";
  if (code === "storage/retry-limit-exceeded") {
    return "Network too slow. Try a smaller file or a better connection.";
  }
  if (code === "storage/quota-exceeded") return "Storage quota exceeded.";
  if (err.message?.toLowerCase().includes("cors")) {
    return "CORS rejected the upload — your domain may need to be added to Storage CORS config.";
  }
  return err.message || String(err);
}
