const GAMEPLAY_AUDIO_UNLOCK_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyE",
  "KeyQ",
  "KeyT",
  "Escape",
]);

export type AudioKeyboardGesture = {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
};

/**
 * Keyboard focus navigation must stay silent. Only a deliberate world-control
 * key counts as the trusted gesture that may begin the optional soundscape.
 */
export function isGameplayAudioUnlockKey(event: AudioKeyboardGesture) {
  return Boolean(
    !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      GAMEPLAY_AUDIO_UNLOCK_CODES.has(event.code),
  );
}
