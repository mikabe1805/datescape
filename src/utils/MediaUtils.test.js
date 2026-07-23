import { isImageMedia, isVideoMedia, mediaUrl } from "./MediaUtils";

describe("profile media classification", () => {
  it("uses MIME metadata when it is available", () => {
    expect(isVideoMedia({ url: "blob:preview", type: "video/webm" })).toBe(true);
    expect(isImageMedia({ url: "blob:preview", contentType: "image/webp" })).toBe(true);
    expect(isVideoMedia({ url: "photo.jpg", type: "image/jpeg" })).toBe(false);
  });

  it("recognizes supported video URLs beyond MP4 and ignores query strings", () => {
    expect(isVideoMedia("https://cdn.example/profile.WEBM?token=one")).toBe(true);
    expect(isVideoMedia("https://cdn.example/o/profile%2Fclip.mov?alt=media")).toBe(true);
    expect(isVideoMedia("https://res.cloudinary.com/demo/video/upload/clip")).toBe(true);
    expect(isVideoMedia("https://cdn.example/photo.webp?alt=media")).toBe(false);
  });

  it("normalizes supported media object URL fields", () => {
    expect(mediaUrl({ downloadURL: "https://cdn.example/photo.jpg" })).toBe(
      "https://cdn.example/photo.jpg",
    );
  });
});
