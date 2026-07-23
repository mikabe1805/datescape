import {
  WORLD_SOUND_STORAGE_KEY,
  loadWorldSoundPreference,
  saveWorldSoundPreference,
} from "./worldSoundPreference";

describe("world sound preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults on and persists explicit off/on choices", () => {
    expect(loadWorldSoundPreference()).toBe(true);

    saveWorldSoundPreference(false);
    expect(window.localStorage.getItem(WORLD_SOUND_STORAGE_KEY)).toBe("off");
    expect(loadWorldSoundPreference()).toBe(false);

    saveWorldSoundPreference(true);
    expect(window.localStorage.getItem(WORLD_SOUND_STORAGE_KEY)).toBe("on");
    expect(loadWorldSoundPreference()).toBe(true);
  });
});
