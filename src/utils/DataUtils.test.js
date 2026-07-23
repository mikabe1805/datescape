import {
  flattenUserData,
  stripSensitiveProfileFields,
  toMatchProfile,
} from "./DataUtils";

describe("profile data boundaries", () => {
  test("removes authentication credentials from profile payloads", () => {
    expect(
      stripSensitiveProfileFields({
        displayName: "River",
        password: "do-not-store",
        confirmPassword: "do-not-store",
        refreshToken: "do-not-copy",
      })
    ).toEqual({ displayName: "River" });
  });

  test("does not carry legacy credentials through profile normalization", () => {
    const result = flattenUserData(
      {
        data: () => ({
          displayName: "River",
          password: "legacy-secret",
          profile: { confirmPassword: "legacy-secret", bio: "Hello" },
        }),
      },
      "user-1"
    );

    expect(result.password).toBeUndefined();
    expect(result.confirmPassword).toBeUndefined();
    expect(result.profile).toBeUndefined();
    expect(result.bio).toBe("Hello");
  });

  test("creates a minimal match calling card instead of copying account data", () => {
    expect(
      toMatchProfile({
        uid: "user-1",
        displayName: "River",
        age: 30,
        password: "secret",
        notificationSettings: { phone: "+15555555555" },
        location: { lat: 40.7, lng: -73.9, city: "Brooklyn" },
        media: ["photo.jpg", { url: "video.mp4" }, null],
      })
    ).toEqual({
      uid: "user-1",
      displayName: "River",
      age: 30,
      media: ["photo.jpg", "video.mp4"],
    });
  });
});
