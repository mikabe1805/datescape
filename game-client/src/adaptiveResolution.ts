export type AdaptiveResolutionState = {
  pixelRatio: number;
  pixelRatioCap: number;
  lowFpsSamples: number;
  highFpsSamples: number;
};

export const ADAPTIVE_RESOLUTION_POLICY = {
  pixelRatioCap: 1.25,
  pixelRatioFloor: 0.75,
  pixelRatioStep: 0.125,
  lowFpsThreshold: 42,
  highFpsThreshold: 57,
  lowSamplesToDecrease: 3,
  highSamplesToIncrease: 6,
} as const;

function roundedPixelRatio(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function createAdaptiveResolutionState(
  devicePixelRatio: number,
): AdaptiveResolutionState {
  const safeDevicePixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const pixelRatioCap = roundedPixelRatio(
    Math.min(
      safeDevicePixelRatio,
      ADAPTIVE_RESOLUTION_POLICY.pixelRatioCap,
    ),
  );
  return {
    pixelRatio: pixelRatioCap,
    pixelRatioCap,
    lowFpsSamples: 0,
    highFpsSamples: 0,
  };
}

export function resetAdaptiveResolutionSamples(
  state: AdaptiveResolutionState,
): AdaptiveResolutionState {
  if (state.lowFpsSamples === 0 && state.highFpsSamples === 0) return state;
  return { ...state, lowFpsSamples: 0, highFpsSamples: 0 };
}

/**
 * Advances one five-second FPS observation. Resolution drops need 15 seconds
 * of sustained pressure; recovery needs 30 seconds of headroom and happens one
 * small step at a time so the renderer does not oscillate around a threshold.
 */
export function sampleAdaptiveResolution(
  state: AdaptiveResolutionState,
  fps: number,
): AdaptiveResolutionState {
  if (!Number.isFinite(fps) || fps <= 0) {
    return resetAdaptiveResolutionSamples(state);
  }

  const floor = Math.min(
    state.pixelRatioCap,
    ADAPTIVE_RESOLUTION_POLICY.pixelRatioFloor,
  );
  if (fps < ADAPTIVE_RESOLUTION_POLICY.lowFpsThreshold) {
    const lowFpsSamples = state.lowFpsSamples + 1;
    if (
      lowFpsSamples >= ADAPTIVE_RESOLUTION_POLICY.lowSamplesToDecrease &&
      state.pixelRatio > floor
    ) {
      return {
        ...state,
        pixelRatio: roundedPixelRatio(
          Math.max(
            floor,
            state.pixelRatio - ADAPTIVE_RESOLUTION_POLICY.pixelRatioStep,
          ),
        ),
        lowFpsSamples: 0,
        highFpsSamples: 0,
      };
    }
    return {
      ...state,
      lowFpsSamples: state.pixelRatio > floor ? lowFpsSamples : 0,
      highFpsSamples: 0,
    };
  }

  if (fps >= ADAPTIVE_RESOLUTION_POLICY.highFpsThreshold) {
    const highFpsSamples = state.highFpsSamples + 1;
    if (
      highFpsSamples >= ADAPTIVE_RESOLUTION_POLICY.highSamplesToIncrease &&
      state.pixelRatio < state.pixelRatioCap
    ) {
      return {
        ...state,
        pixelRatio: roundedPixelRatio(
          Math.min(
            state.pixelRatioCap,
            state.pixelRatio + ADAPTIVE_RESOLUTION_POLICY.pixelRatioStep,
          ),
        ),
        lowFpsSamples: 0,
        highFpsSamples: 0,
      };
    }
    return {
      ...state,
      lowFpsSamples: 0,
      highFpsSamples:
        state.pixelRatio < state.pixelRatioCap ? highFpsSamples : 0,
    };
  }

  return { ...state, lowFpsSamples: 0, highFpsSamples: 0 };
}
