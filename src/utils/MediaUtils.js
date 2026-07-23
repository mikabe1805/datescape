const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "quicktime"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

export function mediaUrl(media) {
  if (typeof media === "string") return media;
  if (!media || typeof media !== "object") return "";
  return media.url || media.src || media.downloadURL || "";
}

function normalizedMediaText(media) {
  const value = mediaUrl(media).toLowerCase();
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mediaMimeType(media) {
  if (!media || typeof media !== "object") return "";
  return String(media.type || media.contentType || media.mimeType || "")
    .trim()
    .toLowerCase();
}

function hasExtension(value, extensions) {
  return extensions.some((extension) =>
    new RegExp(`\\.${extension}(?:$|[?#&/])`, "i").test(value),
  );
}

export function isVideoMedia(media) {
  const mimeType = mediaMimeType(media);
  if (mimeType) return mimeType.startsWith("video/");

  const value = normalizedMediaText(media);
  return (
    value.startsWith("data:video/") ||
    /(?:^|[?&])(content-?type|mime|type)=video\//i.test(value) ||
    /\/video\/upload\//i.test(value) ||
    hasExtension(value, VIDEO_EXTENSIONS)
  );
}

export function isImageMedia(media) {
  const mimeType = mediaMimeType(media);
  if (mimeType) return mimeType.startsWith("image/");

  const value = normalizedMediaText(media);
  return (
    value.startsWith("data:image/") ||
    /(?:^|[?&])(content-?type|mime|type)=image\//i.test(value) ||
    /\/image\/upload\//i.test(value) ||
    hasExtension(value, IMAGE_EXTENSIONS)
  );
}
