export const WORLD_SOUND_STORAGE_KEY = "datescape:afterlight:sound:v1";

export function loadWorldSoundPreference() {
  try {
    return window.localStorage.getItem(WORLD_SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveWorldSoundPreference(enabled) {
  try {
    window.localStorage.setItem(
      WORLD_SOUND_STORAGE_KEY,
      enabled ? "on" : "off",
    );
  } catch {
    // The visual game remains fully playable when storage is unavailable.
  }
}
