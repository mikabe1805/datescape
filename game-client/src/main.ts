import * as pc from "playcanvas";
import dracoGlueUrl from "three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url";
import dracoWasmUrl from "three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url";
import {
  DEFAULT_AVATAR_APPEARANCE,
  WorldBridge,
  type ActivityState,
  type BootPayload,
  type ExpeditionStageId,
  type ExpeditionState,
  type ExpeditionTargetId,
  type PublicPlayer,
} from "./bridge";
import { ACTIVITY_ANCHORS } from "./activityAnchors";
import { isGameplayAudioUnlockKey } from "./audioGesture";
import {
  createAdaptiveResolutionState,
  resetAdaptiveResolutionSamples,
  sampleAdaptiveResolution,
} from "./adaptiveResolution";
import { createMoodStudy } from "./moodStudy";
import {
  AfterlightSoundscape,
  type AudioAnchorId,
  type AudioState,
} from "./worldAudio";
import "./styles.css";

pc.dracoInitialize({
  jsUrl: dracoGlueUrl,
  wasmUrl: dracoWasmUrl,
  numWorkers: 1,
  lazyInit: true,
});

const bridge = new WorldBridge();
let fatalReported = false;
const reportFatal = () => {
  if (fatalReported) return;
  fatalReported = true;
  bridge.send("FATAL_ERROR", { code: "renderer-unavailable" });
};
window.addEventListener("error", reportFatal);
window.addEventListener("unhandledrejection", reportFatal);

const canvas = document.getElementById(
  "application",
) as HTMLCanvasElement | null;
const status = document.getElementById("game-status");
const loading = document.getElementById("game-loading");
const locationLabel = document.getElementById("game-location");
const placeTitle = document.getElementById("game-place-title");
const controlsNote = document.getElementById("game-controls-note");
const feedback = document.getElementById("game-feedback");
const feedbackEyebrow = document.getElementById("game-feedback-eyebrow");
const feedbackTitle = document.getElementById("game-feedback-title");
const feedbackNote = document.getElementById("game-feedback-note");
const touchPad = document.getElementById("game-touch-pad");
const touchThumb = document.getElementById("game-touch-thumb");
const touchAction = document.getElementById(
  "game-touch-action",
) as HTMLButtonElement | null;
const audioToggle = document.getElementById(
  "game-audio-toggle",
) as HTMLButtonElement | null;
const audioStatus = document.getElementById("game-audio-status");
const isEmbedded = window.parent !== window;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

if (!canvas) {
  reportFatal();
  throw new Error("Afterlight canvas is missing");
}

if (isEmbedded) document.documentElement.classList.add("is-embedded");

const keyboard = new pc.Keyboard(window);
const mouse = new pc.Mouse(canvas);
let app: pc.Application;
try {
  app = new pc.Application(canvas, {
    keyboard,
    mouse,
    touch: "ontouchstart" in window ? new pc.TouchDevice(canvas) : undefined,
    graphicsDeviceOptions: {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    },
  });
} catch (error) {
  reportFatal();
  throw error;
}

let adaptiveResolution = createAdaptiveResolutionState(
  window.devicePixelRatio,
);
app.graphicsDevice.maxPixelRatio = adaptiveResolution.pixelRatio;
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(0.04, 0.065, 0.08);
app.scene.exposure = 0.98;
app.scene.fog.type = pc.FOG_LINEAR;
app.scene.fog.color = new pc.Color(0.012, 0.032, 0.052);
app.scene.fog.start = 20;
app.scene.fog.end = 65;
app.start();

const world = createMoodStudy(app);
function presentAudioState(state: AudioState) {
  if (audioStatus) {
    audioStatus.textContent =
      state === "running"
        ? "World sound on"
        : state === "muted"
          ? "World sound off"
          : state === "unsupported"
            ? "World sound unavailable"
            : "World sound ready. Focus or tap the world to start it.";
  }
  if (audioToggle) {
    audioToggle.disabled = state === "unsupported";
    audioToggle.setAttribute(
      "aria-pressed",
      state === "running" ? "true" : "false",
    );
    if (state === "running") {
      audioToggle.textContent = "Sound on";
      audioToggle.setAttribute("aria-label", "Turn off Afterlight world sound");
    } else if (state === "muted") {
      audioToggle.textContent = "Sound off";
      audioToggle.setAttribute("aria-label", "Turn on Afterlight world sound");
    } else if (state === "unsupported") {
      audioToggle.textContent = "Sound unavailable";
      audioToggle.setAttribute(
        "aria-label",
        "Afterlight world sound is unavailable",
      );
    } else {
      audioToggle.textContent = "Start sound";
      audioToggle.setAttribute("aria-label", "Start Afterlight world sound");
    }
  }
  bridge.send("AUDIO_STATE", { state });
}

const soundscape = new AfterlightSoundscape(app, presentAudioState, {
  enabled: isEmbedded ? false : undefined,
  persistPreference: !isEmbedded,
});
soundscape.setHidden(document.hidden);
const externalAxis = { x: 0, z: 0 };
const standaloneAxis = { x: 0, z: 0 };
let paused = false;
let booted = false;
let remotePlayers: PublicPlayer[] = [];
let heading = Math.PI;
let speed = 0;
let snapshotAccumulator = 0;
let performanceAccumulator = 0;
let frameCount = 0;
let cameraYaw = 0;
let cameraPitch = 16;
let cameraDistance = 7.2;
let orbitPointerId: number | null = null;
let orbitX = 0;
let orbitY = 0;
let orbitStartX = 0;
let orbitStartY = 0;
let touchMovePointerId: number | null = null;
let readyRetryId: number | null = null;
let standaloneBootTimer: number | null = null;
let disposed = false;

const cameraTarget = new pc.Vec3();
const cameraPosition = new pc.Vec3();
const PLAYER_RADIUS = 0.24;

const landmarkZones = [
  { id: "conservatory", x: 0, z: 25, radius: 8.2 },
  { id: "market", x: 0, z: 3.5, radius: 7 },
  { id: "resonance", x: -4.8, z: -14, radius: 6.5 },
];

const EXPEDITION_INTERACTION_RADIUS = 2.8;
type ExpeditionTargetDefinition = {
  id: ExpeditionTargetId;
  stageId: Exclude<ExpeditionStageId, "complete">;
  x: number;
  z: number;
  label: string;
  actionLabel: string;
};
const EXPEDITION_TARGETS: readonly ExpeditionTargetDefinition[] = [
  {
    id: "conservatory-scan",
    stageId: "conservatory-scan",
    x: 0,
    z: 25,
    label: "Conservatory rain scan",
    actionLabel: "Scan rainlight",
  },
  {
    id: "market-west",
    stageId: "market-lanterns",
    x: -3.8,
    z: 3.5,
    label: "West market lantern",
    actionLabel: "Tend west lantern",
  },
  {
    id: "market-east",
    stageId: "market-lanterns",
    x: 3.8,
    z: 3.5,
    label: "East market lantern",
    actionLabel: "Tend east lantern",
  },
  {
    id: "resonance-left",
    stageId: "resonance-chime",
    x: -6.4,
    z: -14,
    label: "Left garden chime",
    actionLabel: "Sound left chime",
  },
  {
    id: "resonance-right",
    stageId: "resonance-chime",
    x: -3.2,
    z: -14,
    label: "Right garden chime",
    actionLabel: "Sound right chime",
  },
] as const;

const PLACE_PRESENTATION: Record<
  string,
  { eyebrow: string; title: string; momentTitle: string; momentNote: string }
> = {
  conservatory: {
    eyebrow: "AFTERLIGHT · ARRIVAL CONSERVATORY",
    title: "A world for unhurried encounters",
    momentTitle: "Choose tonight's pace",
    momentNote:
      "Pause beneath the glass canopy. You can stay solo, wander, or open the evening to a considerate hello.",
  },
  market: {
    eyebrow: "AFTERLIGHT · LANTERN MARKET",
    title: "Small reasons to linger together",
    momentTitle: "Listening Crescent",
    momentNote:
      "You settle into the sound pocket. The second place remains open until you choose to invite someone nearby.",
  },
  resonance: {
    eyebrow: "AFTERLIGHT · RESONANCE GARDEN",
    title: "A quieter edge of the city",
    momentTitle: "Tune the garden",
    momentNote:
      "Hold the tone and leave room for another player to answer. Nothing begins without both people choosing it.",
  },
};

let nearbyLandmark: string | null = null;
let expeditionState: ExpeditionState | null = null;
let nearbyExpeditionTarget: ExpeditionTargetDefinition | null = null;

function isCurrentExpeditionTarget(target: ExpeditionTargetDefinition) {
  return Boolean(
    !paused &&
      (expeditionState?.status === "active" ||
        expeditionState?.status === "forming") &&
      expeditionState.instanceId &&
      expeditionState.personal.joined &&
      expeditionState.stageId === target.stageId &&
      expeditionState.personal.availableTargetIds.includes(target.id),
  );
}

function expeditionTargetNear(x: number, z: number) {
  let closest: ExpeditionTargetDefinition | null = null;
  let closestDistance = EXPEDITION_INTERACTION_RADIUS;
  for (const target of EXPEDITION_TARGETS) {
    if (!isCurrentExpeditionTarget(target)) continue;
    const distance = Math.hypot(x - target.x, z - target.z);
    if (distance < closestDistance) {
      closest = target;
      closestDistance = distance;
    }
  }
  return closest;
}

function updateTouchActionPresentation() {
  if (!touchAction) return;
  if (nearbyExpeditionTarget) {
    touchAction.disabled = false;
    touchAction.textContent = nearbyExpeditionTarget.actionLabel;
    return;
  }
  touchAction.disabled = !nearbyLandmark;
  touchAction.textContent = nearbyLandmark ? "Interact" : "Explore";
}

function setNearbyExpeditionTarget(
  target: ExpeditionTargetDefinition | null,
) {
  if (target?.id === nearbyExpeditionTarget?.id) return;
  nearbyExpeditionTarget = target;
  bridge.send(
    "EXPEDITION_TARGET_CHANGED",
    target && expeditionState?.instanceId
      ? { instanceId: expeditionState.instanceId, targetId: target.id }
      : { instanceId: null, targetId: null },
  );
  updateTouchActionPresentation();
  updateStatusText();
}

function updatePlacePresentation(id: string | null) {
  const copy = id ? PLACE_PRESENTATION[id] : null;
  if (locationLabel)
    locationLabel.textContent = copy?.eyebrow || "AFTERLIGHT · TIDELINE WALK";
  if (placeTitle)
    placeTitle.textContent = copy?.title || "Follow the light toward company";
  if (controlsNote) {
    controlsNote.textContent = coarsePointer
      ? "Use the move pad · drag to look · tap Interact when a place responds"
      : "WASD or arrow keys to move · drag to orbit · E to interact";
  }
  if (touchAction) {
    updateTouchActionPresentation();
  }
  if (feedback?.classList.contains("is-active")) {
    feedback.classList.remove("is-active");
  }
}

function updateStatusText() {
  if (!status || !booted) return;
  if (nearbyExpeditionTarget) {
    const cooperation =
      nearbyExpeditionTarget.stageId === "conservatory-scan"
        ? "Route marker ready"
        : expeditionState?.personal.canUseEcho
          ? "Echo ready"
          : (expeditionState?.memberCount || 0) > 1
            ? `${expeditionState?.memberCount} Lanternkeepers`
            : "Partner signal open";
    status.textContent = `${nearbyExpeditionTarget.label} - ${cooperation} - ${
      coarsePointer ? `Tap ${nearbyExpeditionTarget.actionLabel}` : "E to contribute"
    }`;
    return;
  }
  status.textContent = nearbyLandmark
    ? `${nearbyLandmark.split("-").join(" ")} · ${coarsePointer ? "Tap Interact" : "E to interact"}`
    : "Afterlight promenade";
}

type BlockingRect = { x: number; z: number; halfX: number; halfZ: number };
type BlockingCircle = { x: number; z: number; radius: number };

const fallbackMarketBlockingRects: BlockingRect[] = [
  ...[-5.3, 5.3].flatMap((x) =>
    [7.5, 3.5, -0.5].map((z) => ({ x, z, halfX: 1.95, halfZ: 1.48 })),
  ),
];
const authoredMarketBlockingRects: BlockingRect[] = [
  { x: -5.83, z: 0.75, halfX: 0.28, halfZ: 1.28 },
  { x: -4.43, z: 1.17, halfX: 1.44, halfZ: 0.46 },
  { x: 5.83, z: 1.4, halfX: 0.28, halfZ: 1.28 },
  { x: 4.63, z: 1.82, halfX: 1.44, halfZ: 0.46 },
  { x: 3.45, z: 4.4, halfX: 1.58, halfZ: 0.5 },
  { x: -4.1, z: 4.22, halfX: 1.6, halfZ: 0.38 },
  { x: -3.55, z: 6.14, halfX: 1.96, halfZ: 0.54 },
  { x: 4.25, z: 7.25, halfX: 1.3, halfZ: 0.38 },
  { x: 6.23, z: 8.05, halfX: 0.72, halfZ: 0.42 },
];
const staticBlockingRects: BlockingRect[] = [
  { x: -3.5, z: 14.4, halfX: 0.9, halfZ: 0.85 },
  { x: 3.5, z: 14.4, halfX: 0.9, halfZ: 0.85 },
  { x: 1.2, z: -17, halfX: 2.05, halfZ: 0.75 },
];
const authoredMarketBlockingCircles: BlockingCircle[] = [
  { x: -2.67, z: 1.8, radius: 0.16 },
  { x: -2.67, z: -0.3, radius: 0.16 },
  { x: 2.67, z: 2.45, radius: 0.16 },
  { x: 2.67, z: 0.35, radius: 0.16 },
  { x: -6.05, z: 3.35, radius: 0.3 },
  { x: 6.05, z: 3.35, radius: 0.3 },
];
const gardenBlockingCircles: BlockingCircle[] = [
  { x: -7.2, z: -7.5, radius: 1.65 },
  { x: -5.6, z: -11.4, radius: 1.3 },
  { x: -8.3, z: -14.2, radius: 1.5 },
  { x: -4.6, z: -16.3, radius: 1.1 },
];
const authoredGardenBlockingRects: BlockingRect[] = [
  { x: 0, z: -14.3, halfX: 2.17, halfZ: 1.31 },
  { x: -4.4, z: -12.58, halfX: 1.47, halfZ: 0.63 },
  { x: 4.18, z: -14.55, halfX: 1.86, halfZ: 0.62 },
  { x: 3.68, z: -17.14, halfX: 2.45, halfZ: 0.16 },
  { x: 4.65, z: -12.34, halfX: 1.56, halfZ: 0.39 },
  { x: 5.62, z: -9.64, halfX: 0.7, halfZ: 0.52 },
  { x: -4.95, z: -17.08, halfX: 1.63, halfZ: 0.12 },
  { x: -1.95, z: -17.08, halfX: 0.68, halfZ: 0.12 },
  { x: 0, z: -18.05, halfX: 6.6, halfZ: 0.96 },
];
const authoredMarketCameraRects: BlockingRect[] = [
  { x: -4.25, z: 0.75, halfX: 1.84, halfZ: 1.44 },
  { x: 4.25, z: 1.4, halfX: 1.84, halfZ: 1.44 },
  { x: 4.25, z: 7.25, halfX: 1.3, halfZ: 0.38 },
  { x: 6.23, z: 8.05, halfX: 0.72, halfZ: 0.42 },
];
const staticCameraRects = staticBlockingRects.slice(0, 2);
const arrivalBlockingRects = staticBlockingRects.slice(0, 2);
const authoredGardenCameraRects: BlockingRect[] = [
  { x: 0, z: -14.3, halfX: 2.2, halfZ: 1.35 },
  { x: -4.4, z: -12.58, halfX: 1.5, halfZ: 0.66 },
  { x: 4.18, z: -14.55, halfX: 1.9, halfZ: 0.65 },
  { x: 4.65, z: -12.34, halfX: 1.6, halfZ: 0.42 },
  { x: 5.62, z: -9.64, halfX: 0.74, halfZ: 0.56 },
];
let blockingRects = [...fallbackMarketBlockingRects, ...staticBlockingRects];
let blockingCircles = [...gardenBlockingCircles];
let cameraBlockingRects = [
  ...fallbackMarketBlockingRects,
  ...staticCameraRects,
];
let cameraBlockingCircles = [...gardenBlockingCircles];
let authoredMarketActive = false;
let authoredGardenActive = false;
let activeActivity: ActivityState | null = null;
let currentJourneyId: string | null = null;
let currentJourneyComplete = false;

const AUDIO_MARKERS: Array<{
  id: AudioAnchorId;
  marker: string;
  index?: number;
  ready: "arrival" | "market" | "garden";
}> = [
  {
    id: "arrival-water-left",
    marker: "SFX_ALC_Water_A",
    index: 0,
    ready: "arrival",
  },
  {
    id: "arrival-water-right",
    marker: "SFX_ALC_Water_A",
    index: 1,
    ready: "arrival",
  },
  { id: "market-water", marker: "SFX_LM_WaterDrain_A", ready: "market" },
  {
    id: "market-fabric-left",
    marker: "SFX_LM_StallFabric_A",
    ready: "market",
  },
  {
    id: "market-fabric-right",
    marker: "SFX_LM_StallFabric_B",
    ready: "market",
  },
  {
    id: "market-performance",
    marker: "SFX_LM_PerformancePocket_A",
    ready: "market",
  },
  { id: "garden-water", marker: "SFX_RG_WaterEdge_A", ready: "garden" },
  { id: "garden-loom", marker: "SFX_RG_LoomTone_A", ready: "garden" },
  {
    id: "garden-bowl",
    marker: "SFX_RG_SoundBowlCluster_A",
    ready: "garden",
  },
  {
    id: "garden-dais",
    marker: "SFX_RG_ListeningDais_A",
    ready: "garden",
  },
];

function syncAudioMarkers(ready: "arrival" | "market" | "garden") {
  AUDIO_MARKERS.filter((entry) => entry.ready === ready).forEach((entry) => {
    const positions = world.getAudioAnchorPositions(entry.marker);
    const position = positions[entry.index ?? 0];
    if (position) soundscape.setAnchor(entry.id, position);
  });
}

void world.ready.then(() => syncAudioMarkers("arrival"));

world.marketReady.then((authoredMarket) => {
  if (!authoredMarket) return;
  syncAudioMarkers("market");
  authoredMarketActive = true;
  document.documentElement.classList.add("has-authored-market");
  blockingRects = [...authoredMarketBlockingRects, ...staticBlockingRects];
  blockingCircles = [
    ...authoredMarketBlockingCircles,
    ...gardenBlockingCircles,
  ];
  cameraBlockingRects = [...authoredMarketCameraRects, ...staticCameraRects];
  cameraBlockingCircles = [
    ...authoredMarketBlockingCircles.slice(-2),
    ...gardenBlockingCircles,
  ];
});

world.gardenReady.then((authoredGarden) => {
  if (!authoredGarden) return;
  syncAudioMarkers("garden");
  authoredGardenActive = true;
  document.documentElement.classList.add("has-authored-garden");
  blockingRects = [
    ...(authoredMarketActive
      ? authoredMarketBlockingRects
      : fallbackMarketBlockingRects),
    ...arrivalBlockingRects,
    ...authoredGardenBlockingRects,
  ];
  blockingCircles = authoredMarketActive
    ? [...authoredMarketBlockingCircles]
    : [];
  cameraBlockingRects = [
    ...(authoredMarketActive
      ? authoredMarketCameraRects
      : fallbackMarketBlockingRects),
    ...staticCameraRects,
    ...authoredGardenCameraRects,
  ];
  cameraBlockingCircles = authoredMarketActive
    ? [...authoredMarketBlockingCircles.slice(-2)]
    : [];
});

world.avatarReady.then((authoredAvatar) => {
  if (authoredAvatar)
    document.documentElement.classList.add("has-authored-avatar");
});

world.environmentReady.then((environment) => {
  if (environment) {
    document.documentElement.classList.add("has-hdr-environment");
  }
});

function arrivalHalfWidth(z: number) {
  if (z >= 29.45) return 3.5;
  if (z >= 28.05) return 3.25;
  if (z >= 26.35) return 3;
  return 2.35;
}

function isWalkable(x: number, z: number) {
  if (z < -24.6 || z > 30.65) return false;

  let onFoundation = false;
  if (z > 12.2) {
    onFoundation = Math.abs(x) <= arrivalHalfWidth(z) - PLAYER_RADIUS;
  } else {
    const onTerrace = Math.abs(x) <= 8.15 - PLAYER_RADIUS;
    const dx = x + 7.2;
    const dz = z + 5;
    const angle = 8 * pc.math.DEG_TO_RAD;
    const localX = Math.cos(angle) * dx - Math.sin(angle) * dz;
    const localZ = Math.sin(angle) * dx + Math.cos(angle) * dz;
    const onGardenWalk =
      Math.abs(localX) <= 2.15 - PLAYER_RADIUS &&
      Math.abs(localZ) <= 11.65 - PLAYER_RADIUS;
    onFoundation = onTerrace || onGardenWalk;
  }
  if (!onFoundation) return false;

  const insideRect = blockingRects.some(
    (rect) =>
      Math.abs(x - rect.x) < rect.halfX + PLAYER_RADIUS &&
      Math.abs(z - rect.z) < rect.halfZ + PLAYER_RADIUS,
  );
  const insideCircle = blockingCircles.some(
    (circle) =>
      Math.hypot(x - circle.x, z - circle.z) < circle.radius + PLAYER_RADIUS,
  );
  return !insideRect && !insideCircle;
}

function playerRootHeight(x: number, z: number) {
  let height = 0.21;
  if (z >= 29.45) height = 0.05;
  else if (z >= 28.05) height = 0.12;
  else if (z >= 26.35) height = 0.19;

  const onGardenTerrace =
    authoredGardenActive &&
    Math.abs(x) <= 6.55 - PLAYER_RADIUS &&
    z >= -17.1 + PLAYER_RADIUS &&
    z <= -8.6 - PLAYER_RADIUS;
  if (onGardenTerrace) height = 0.42;

  const onListeningDais =
    authoredMarketActive &&
    Math.abs(x + 3.55) <= 2.1 - PLAYER_RADIUS &&
    Math.abs(z - 7.05) <= 1.52 - PLAYER_RADIUS;
  if (onListeningDais) height += 0.2;

  const onGardenListeningDais =
    authoredGardenActive &&
    Math.abs(x + 4.28) <= 1.9 - PLAYER_RADIUS &&
    Math.abs(z + 15.82) <= 1.34 - PLAYER_RADIUS;
  return onGardenListeningDais ? 0.65 : height;
}

function cameraObstructed(x: number, z: number) {
  if (z > 12.2 && z < 30.65 && Math.abs(x) > 1.25) return true;
  const insideRect = cameraBlockingRects.some(
    (rect) =>
      Math.abs(x - rect.x) < rect.halfX + 0.3 &&
      Math.abs(z - rect.z) < rect.halfZ + 0.3,
  );
  const insideCircle = cameraBlockingCircles.some(
    (circle) => Math.hypot(x - circle.x, z - circle.z) < circle.radius + 0.3,
  );
  return insideRect || insideCircle;
}

function keepCameraClear(playerPosition: pc.Vec3, desiredPosition: pc.Vec3) {
  const steps = 18;
  let safeFraction = 1;
  for (let step = 1; step <= steps; step += 1) {
    const fraction = step / steps;
    const x = pc.math.lerp(playerPosition.x, desiredPosition.x, fraction);
    const z = pc.math.lerp(playerPosition.z, desiredPosition.z, fraction);
    if (cameraObstructed(x, z)) {
      safeFraction = Math.max(0.2, (step - 1) / steps - 0.03);
      break;
    }
  }
  if (safeFraction >= 1) return 1;
  desiredPosition.set(
    pc.math.lerp(playerPosition.x, desiredPosition.x, safeFraction),
    pc.math.lerp(playerPosition.y + 1.7, desiredPosition.y, safeFraction),
    pc.math.lerp(playerPosition.z, desiredPosition.z, safeFraction),
  );
  return safeFraction;
}

function clearOrbit() {
  const pointerId = orbitPointerId;
  orbitPointerId = null;
  if (pointerId !== null && canvas?.hasPointerCapture(pointerId)) {
    canvas.releasePointerCapture(pointerId);
  }
}

const onOrbitStart = (event: PointerEvent) => {
  if (paused || orbitPointerId !== null || !event.isPrimary) return;
  if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2)
    return;
  orbitPointerId = event.pointerId;
  orbitX = event.clientX;
  orbitY = event.clientY;
  orbitStartX = event.clientX;
  orbitStartY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
};
const onOrbitMove = (event: PointerEvent) => {
  if (paused || event.pointerId !== orbitPointerId) return;
  cameraYaw -= (event.clientX - orbitX) * 0.24;
  cameraPitch = pc.math.clamp(
    cameraPitch + (event.clientY - orbitY) * 0.18,
    9,
    36,
  );
  orbitX = event.clientX;
  orbitY = event.clientY;
};
const onOrbitEnd = (event: PointerEvent) => {
  if (event.pointerId !== orbitPointerId) return;
  const shouldSelect =
    event.type === "pointerup" &&
    (event.pointerType !== "mouse" || event.button === 0) &&
    Math.hypot(event.clientX - orbitStartX, event.clientY - orbitStartY) <= 7;
  clearOrbit();
  if (shouldSelect) {
    const rect = canvas.getBoundingClientRect();
    const uid = world.pickRemotePlayer(
      event.clientX - rect.left,
      event.clientY - rect.top,
      event.pointerType === "touch" ? 64 : 48,
    );
    if (uid) bridge.send("REMOTE_PLAYER_SELECTED", { uid });
  }
};
const onCameraWheel = (event: WheelEvent) => {
  if (paused) return;
  event.preventDefault();
  cameraDistance = pc.math.clamp(
    cameraDistance + event.deltaY * 0.008,
    5.8,
    11.5,
  );
};
const stopContextMenu = (event: MouseEvent) => event.preventDefault();

const TOUCH_AXIS_RADIUS = 42;
function resetTouchMove() {
  touchMovePointerId = null;
  standaloneAxis.x = 0;
  standaloneAxis.z = 0;
  touchPad?.classList.remove("is-active");
  if (touchThumb) touchThumb.style.transform = "translate(0px, 0px)";
}

function updateTouchMove(event: PointerEvent) {
  if (!touchPad || event.pointerId !== touchMovePointerId) return;
  const rect = touchPad.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  const scale = distance > TOUCH_AXIS_RADIUS ? TOUCH_AXIS_RADIUS / distance : 1;
  const x = dx * scale;
  const y = dy * scale;
  standaloneAxis.x = x / TOUCH_AXIS_RADIUS;
  standaloneAxis.z = y / TOUCH_AXIS_RADIUS;
  if (touchThumb) touchThumb.style.transform = `translate(${x}px, ${y}px)`;
}

const onTouchMoveStart = (event: PointerEvent) => {
  if (isEmbedded || paused || touchMovePointerId !== null) return;
  touchMovePointerId = event.pointerId;
  touchPad?.classList.add("is-active");
  touchPad?.setPointerCapture(event.pointerId);
  updateTouchMove(event);
  event.preventDefault();
};
const onTouchMove = (event: PointerEvent) => {
  updateTouchMove(event);
  if (event.pointerId === touchMovePointerId) event.preventDefault();
};
const onTouchMoveEnd = (event: PointerEvent) => {
  if (event.pointerId !== touchMovePointerId) return;
  resetTouchMove();
  event.preventDefault();
};
const onWindowBlur = () => {
  clearOrbit();
  resetTouchMove();
};
const onTrustedAudioGesture = (event: Event) => {
  if (
    event.target === audioToggle ||
    soundscape.state !== "locked" ||
    (event instanceof KeyboardEvent && !isGameplayAudioUnlockKey(event))
  )
    return;
  void soundscape.beginFromGesture();
};
const onAudioToggle = () => {
  void soundscape.toggleFromGesture();
};

canvas.addEventListener("pointerdown", onOrbitStart);
canvas.addEventListener("pointermove", onOrbitMove);
canvas.addEventListener("pointerup", onOrbitEnd);
canvas.addEventListener("pointercancel", onOrbitEnd);
canvas.addEventListener("lostpointercapture", onOrbitEnd);
canvas.addEventListener("wheel", onCameraWheel, { passive: false });
canvas.addEventListener("contextmenu", stopContextMenu);
window.addEventListener("blur", onWindowBlur);
window.addEventListener("pointerdown", onTrustedAudioGesture, true);
window.addEventListener("keydown", onTrustedAudioGesture, true);
touchPad?.addEventListener("pointerdown", onTouchMoveStart);
touchPad?.addEventListener("pointermove", onTouchMove);
touchPad?.addEventListener("pointerup", onTouchMoveEnd);
touchPad?.addEventListener("pointercancel", onTouchMoveEnd);
touchPad?.addEventListener("lostpointercapture", onTouchMoveEnd);
audioToggle?.addEventListener("click", onAudioToggle);

function applyBoot(payload: BootPayload) {
  booted = true;
  if (readyRetryId !== null) {
    window.clearInterval(readyRetryId);
    readyRetryId = null;
  }
  world.setPlayerAppearance(
    payload.player.color,
    payload.player.appearance,
  );
  remotePlayers = payload.remotePlayers || [];
  world.setRemotePlayers(remotePlayers);
  updatePlacePresentation(nearbyLandmark);
  updateStatusText();
}

bridge.onBoot(applyBoot);
bridge.onRemotePlayers((players) => {
  remotePlayers = players;
  world.setRemotePlayers(players);
});
bridge.onAvatarUpdated((avatar) => {
  world.setPlayerAppearance(avatar.color, avatar.appearance);
});
bridge.onAxis((axis) => {
  externalAxis.x = pc.math.clamp(axis.x, -1, 1);
  externalAxis.z = pc.math.clamp(axis.z, -1, 1);
});
bridge.onPause((nextPaused) => {
  paused = nextPaused;
  soundscape.setPaused(paused);
  if (paused) {
    externalAxis.x = 0;
    externalAxis.z = 0;
    resetTouchMove();
    speed = 0;
    clearOrbit();
  }
  const playerPosition = world.player.getPosition();
  setNearbyExpeditionTarget(
    expeditionTargetNear(playerPosition.x, playerPosition.z),
  );
});
bridge.onActivity((activity) => {
  activeActivity = activity;
  soundscape.setActivity(activity?.id ?? null);
  world.setPlayerActivityPose(
    activity?.id === "listening-crescent" ? "listening" : null,
  );
  world.setActivityState(activity);
  if (status) {
    if (!activity) {
      updateStatusText();
    } else {
      const place =
        activity.id === "listening-crescent"
          ? "Listening Crescent"
          : "Resonance Loom";
      const phase =
        activity.phase === "waiting"
          ? "waiting for both choices"
          : activity.phase === "playing"
            ? activity.id === "listening-crescent"
              ? "listening together"
              : "tuning together"
            : "moment complete";
      status.textContent = `${place} · ${phase}`;
    }
  }
});
bridge.onJourney((journey) => {
  const newlyComplete =
    journey.complete &&
    (journey.id !== currentJourneyId || !currentJourneyComplete);
  currentJourneyId = journey.id;
  currentJourneyComplete = journey.complete;
  world.setJourneyState(journey);
  if (newlyComplete) soundscape.playJourneyCompleteCue();
});
bridge.onQuest((quest) => {
  world.setQuestState(quest);
});
bridge.onPublicEvent((publicEvent) => {
  world.setPublicEventState(publicEvent);
});
bridge.onExpedition((expedition) => {
  const previousInstanceId = expeditionState?.instanceId ?? null;
  if (expeditionState) {
    const sameInstance = expedition.instanceId === expeditionState.instanceId;
    if (sameInstance && expedition.revision < expeditionState.revision) return;
    if (
      sameInstance &&
      expedition.revision === expeditionState.revision &&
      expedition.serverNow < expeditionState.serverNow
    )
      return;
    if (!sameInstance && expedition.serverNow <= expeditionState.serverNow)
      return;
  }

  if (previousInstanceId !== expedition.instanceId && nearbyExpeditionTarget) {
    setNearbyExpeditionTarget(null);
  }
  expeditionState = expedition;
  world.setExpeditionState(expedition);
  const playerPosition = world.player.getPosition();
  setNearbyExpeditionTarget(
    expeditionTargetNear(playerPosition.x, playerPosition.z),
  );
});
bridge.onAudioSettings((enabled) => {
  void soundscape.setEnabled(enabled);
});

type LocalAction = "interact" | "emote" | "chat" | "escape";
const actionByCode: Record<string, LocalAction> = {
  KeyE: "interact",
  KeyQ: "emote",
  KeyT: "chat",
  Escape: "escape",
};

function closeStandaloneMoment() {
  feedback?.classList.remove("is-active");
  updateTouchActionPresentation();
  updateStatusText();
}

function requestAction(action: LocalAction) {
  if (
    action === "interact" &&
    nearbyExpeditionTarget &&
    (expeditionState?.status === "active" ||
      expeditionState?.status === "forming") &&
    expeditionState.instanceId &&
    expeditionState.personal.joined &&
    expeditionState.personal.availableTargetIds.includes(
      nearbyExpeditionTarget.id,
    )
  ) {
    bridge.send("ACTION_REQUESTED", {
      action: "expedition-contribute",
      target: {
        kind: "expedition",
        instanceId: expeditionState.instanceId,
        targetId: nearbyExpeditionTarget.id,
      },
    });
    if (isEmbedded) return;
    if (feedbackEyebrow)
      feedbackEyebrow.textContent = "AFTERLIGHT - LANTERNKEEPER EXPEDITION";
    if (feedbackTitle)
      feedbackTitle.textContent = nearbyExpeditionTarget.actionLabel;
    if (feedbackNote)
      feedbackNote.textContent =
        nearbyExpeditionTarget.stageId === "conservatory-scan"
          ? "The glasshouse trail is recorded. Follow its light toward Lantern Market."
          : expeditionState.personal.canUseEcho
            ? "Your Echo answers the station. The expedition remains open and penalty-free."
            : "Your signal is banked here. Another Lanternkeeper can answer from the paired light.";
    feedback?.classList.add("is-active");
    return;
  }

  bridge.send("ACTION_REQUESTED", { action });
  if (isEmbedded) return;

  if (action === "escape") {
    closeStandaloneMoment();
    return;
  }
  if (action === "interact") {
    soundscape.playInteractionCue(
      nearbyLandmark as "conservatory" | "market" | "resonance" | null,
    );
    if (feedback?.classList.contains("is-active")) {
      closeStandaloneMoment();
      return;
    }
    const copy = nearbyLandmark ? PLACE_PRESENTATION[nearbyLandmark] : null;
    if (!copy) return;
    if (feedbackEyebrow) feedbackEyebrow.textContent = copy.eyebrow;
    if (feedbackTitle) feedbackTitle.textContent = copy.momentTitle;
    if (feedbackNote) feedbackNote.textContent = copy.momentNote;
    feedback?.classList.add("is-active");
    if (touchAction) touchAction.textContent = "Close";
    if (status)
      status.textContent = `${copy.momentTitle} · choose when to leave`;
    return;
  }

  if (feedbackEyebrow) feedbackEyebrow.textContent = "AFTERLIGHT · YOUR SIGNAL";
  if (feedbackTitle)
    feedbackTitle.textContent =
      action === "emote"
        ? "You offer a quiet wave"
        : "Conversation opens in the full app";
  if (feedbackNote)
    feedbackNote.textContent =
      action === "emote"
        ? "Nearby players can decide whether to answer. A wave never opens a chat by itself."
        : "The standalone world preview carries no account or private chat state.";
  feedback?.classList.add("is-active");
}

const onActionKey = (event: KeyboardEvent) => {
  if (paused) return;
  const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
  if (
    tag === "input" ||
    tag === "textarea" ||
    (event.target as HTMLElement | null)?.isContentEditable
  )
    return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  const action = actionByCode[event.code];
  if (!action) return;
  event.preventDefault();
  requestAction(action);
};
window.addEventListener("keydown", onActionKey);

const onTouchAction = () => requestAction("interact");
touchAction?.addEventListener("click", onTouchAction);

world.ready.then(({ authoredArrival }) => {
  document.documentElement.classList.add("is-ready");
  loading?.setAttribute("aria-hidden", "true");
  if (status) {
    status.textContent = authoredArrival
      ? "Arrival Conservatory ready"
      : "Arrival fallback ready";
  }
  const readyPayload = {
    renderer: "playcanvas-2",
    capabilities: [
      "authored-arrival",
      "camera-orbit",
      "local-movement",
      "remote-proxies",
      "landmark-proximity",
      "contextual-interface",
      "standalone-touch",
      "activity-alignment",
      "activity-phase-v1",
      "resonance-duet-alignment",
      "spatial-soundscape",
      "audio-preference",
      "night-journey-v1",
      "quest-target-v1",
      "rainlight-relay-v1",
      "lanternkeeper-expedition-v2",
      "avatar-appearance-v1",
      "performance-samples",
      "progressive-environment",
    ],
  };
  const announceReady = () => bridge.send("READY", readyPayload);
  announceReady();

  if (isEmbedded && !booted) {
    readyRetryId = window.setInterval(() => {
      if (booted) return;
      announceReady();
    }, 1500);
  }

  // Direct Vite previews do not have the React shell. Start with a safe local presentation.
  standaloneBootTimer = window.setTimeout(() => {
    standaloneBootTimer = null;
    if (booted || isEmbedded) return;
    applyBoot({
      room: "arrival-conservatory",
      player: {
        name: "Wayfarer",
        color: "#d97967",
        intent: "solo",
        appearance: DEFAULT_AVATAR_APPEARANCE,
      },
      remotePlayers: [],
    });
  }, 250);
});

function keyboardAxis() {
  let x = 0;
  let z = 0;
  if (keyboard.isPressed(pc.KEY_A) || keyboard.isPressed(pc.KEY_LEFT)) x -= 1;
  if (keyboard.isPressed(pc.KEY_D) || keyboard.isPressed(pc.KEY_RIGHT)) x += 1;
  if (keyboard.isPressed(pc.KEY_W) || keyboard.isPressed(pc.KEY_UP)) z -= 1;
  if (keyboard.isPressed(pc.KEY_S) || keyboard.isPressed(pc.KEY_DOWN)) z += 1;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}

app.on("update", (dt: number) => {
  if (world.player.getPosition().z > 12.2) {
    // Keep the camera inside the narrow glasshouse until the player reaches the open promenade.
    cameraYaw = pc.math.clamp(cameraYaw, -10, 10);
  }

  if (!paused && !activeActivity) {
    const keys = keyboardAxis();
    const useExternal = Math.hypot(externalAxis.x, externalAxis.z) > 0.05;
    const useStandaloneTouch =
      !isEmbedded && Math.hypot(standaloneAxis.x, standaloneAxis.z) > 0.05;
    const axis = useExternal
      ? externalAxis
      : useStandaloneTouch
        ? standaloneAxis
        : keys;
    const magnitude = Math.min(1, Math.hypot(axis.x, axis.z));
    speed += ((magnitude > 0.02 ? 4.4 : 0) - speed) * Math.min(1, dt * 9);

    if (magnitude > 0.02) {
      const strafe = axis.x / magnitude;
      const forward = -axis.z / magnitude;
      const yaw = cameraYaw * pc.math.DEG_TO_RAD;
      const moveX = Math.cos(yaw) * strafe - Math.sin(yaw) * forward;
      const moveZ = -Math.sin(yaw) * strafe - Math.cos(yaw) * forward;
      const current = world.player.getPosition();
      const nextX = current.x + moveX * speed * dt;
      const nextZ = current.z + moveZ * speed * dt;
      let resolvedX = current.x;
      let resolvedZ = current.z;

      // Resolve one axis at a time so the avatar slides along boundaries instead of snapping through them.
      if (isWalkable(nextX, current.z)) resolvedX = nextX;
      if (isWalkable(resolvedX, nextZ)) resolvedZ = nextZ;

      if (resolvedX !== current.x || resolvedZ !== current.z) {
        world.player.setPosition(resolvedX, current.y, resolvedZ);
        heading = Math.atan2(moveX, moveZ);
        world.player.setEulerAngles(0, (heading * 180) / Math.PI, 0);
      }
    }
  }

  if (activeActivity) {
    const anchor = ACTIVITY_ANCHORS[activeActivity.id][activeActivity.slot];
    const current = world.player.getPosition();
    const settleBlend = 1 - Math.exp(-dt * 5.5);
    world.player.setPosition(
      pc.math.lerp(current.x, anchor.x, settleBlend),
      current.y,
      pc.math.lerp(current.z, anchor.z, settleBlend),
    );
    const currentHeading = world.player.getEulerAngles().y;
    const headingDelta = ((anchor.heading - currentHeading + 540) % 360) - 180;
    world.player.setEulerAngles(
      0,
      currentHeading + headingDelta * settleBlend,
      0,
    );
    heading = anchor.heading * pc.math.DEG_TO_RAD;
    speed = pc.math.lerp(speed, 0, Math.min(1, dt * 12));
  }

  const unsmoothedPlayerPosition = world.player.getPosition();
  const targetPlayerHeight = activeActivity
    ? ACTIVITY_ANCHORS[activeActivity.id][activeActivity.slot].y
    : playerRootHeight(unsmoothedPlayerPosition.x, unsmoothedPlayerPosition.z);
  if (Math.abs(unsmoothedPlayerPosition.y - targetPlayerHeight) > 0.0001) {
    world.player.setPosition(
      unsmoothedPlayerPosition.x,
      pc.math.lerp(
        unsmoothedPlayerPosition.y,
        targetPlayerHeight,
        Math.min(1, dt * 8),
      ),
      unsmoothedPlayerPosition.z,
    );
  }

  const playerPosition = world.player.getPosition();
  const nextExpeditionTarget = expeditionTargetNear(
    playerPosition.x,
    playerPosition.z,
  );
  if (nextExpeditionTarget?.id !== nearbyExpeditionTarget?.id) {
    setNearbyExpeditionTarget(nextExpeditionTarget);
  }
  soundscape.update(playerPosition.x, playerPosition.z, cameraYaw);
  const yaw = cameraYaw * pc.math.DEG_TO_RAD;
  const pitch = cameraPitch * pc.math.DEG_TO_RAD;
  const portraitScale =
    canvas.clientWidth / Math.max(1, canvas.clientHeight) < 0.72 ? 1.18 : 1;
  const viewDistance = cameraDistance * portraitScale;
  const horizontalDistance = Math.cos(pitch) * viewDistance;
  const cameraSafeHalfWidth = playerPosition.z > 12.2 ? 1.25 : 7.7;
  const desiredCameraX = pc.math.clamp(
    playerPosition.x + Math.sin(yaw) * horizontalDistance,
    -cameraSafeHalfWidth,
    cameraSafeHalfWidth,
  );
  cameraTarget.set(
    desiredCameraX,
    playerPosition.y + 1.35 + Math.sin(pitch) * viewDistance,
    playerPosition.z + Math.cos(yaw) * horizontalDistance,
  );
  keepCameraClear(playerPosition, cameraTarget);
  cameraPosition.lerp(
    world.camera.getPosition(),
    cameraTarget,
    Math.min(1, dt * 4.6),
  );
  const cameraClearance = keepCameraClear(playerPosition, cameraPosition);
  if (playerPosition.z > 12.2) {
    cameraPosition.x = pc.math.clamp(
      cameraPosition.x,
      -cameraSafeHalfWidth,
      cameraSafeHalfWidth,
    );
  }
  world.camera.setPosition(cameraPosition);
  if (world.camera.camera) {
    const targetFov = 48 + (1 - cameraClearance) * 16;
    world.camera.camera.fov = pc.math.lerp(
      world.camera.camera.fov,
      targetFov,
      Math.min(1, dt * 7),
    );
  }
  world.camera.lookAt(
    playerPosition.x - Math.sin(yaw) * 2.8,
    playerPosition.y + 1.2,
    playerPosition.z - Math.cos(yaw) * 2.8,
  );

  const nextLandmark =
    landmarkZones.find(
      (zone) =>
        Math.hypot(playerPosition.x - zone.x, playerPosition.z - zone.z) <
        zone.radius,
    )?.id || null;
  if (nextLandmark !== nearbyLandmark) {
    nearbyLandmark = nextLandmark;
    bridge.send("LANDMARK_ENTERED", { id: nearbyLandmark });
    if (nearbyLandmark) {
      soundscape.playLandmarkCue(
        nearbyLandmark as "conservatory" | "market" | "resonance",
      );
    }
    updatePlacePresentation(nearbyLandmark);
    updateStatusText();
  }

  snapshotAccumulator += dt;
  if (snapshotAccumulator >= 1 / 6) {
    snapshotAccumulator = 0;
    bridge.send("LOCAL_SNAPSHOT", {
      x: playerPosition.x,
      z: playerPosition.z,
      heading,
      speed,
    });
  }

  performanceAccumulator += dt;
  frameCount += 1;
  if (performanceAccumulator >= 5) {
    const sampledFps = Math.round(frameCount / performanceAccumulator);
    bridge.send("PERFORMANCE_SAMPLE", {
      fps: sampledFps,
      remotePlayers: remotePlayers.length,
    });
    if (!document.hidden) {
      const nextAdaptiveResolution = sampleAdaptiveResolution(
        adaptiveResolution,
        sampledFps,
      );
      if (
        nextAdaptiveResolution.pixelRatio !== adaptiveResolution.pixelRatio
      ) {
        app.graphicsDevice.maxPixelRatio =
          nextAdaptiveResolution.pixelRatio;
        app.resizeCanvas();
      }
      adaptiveResolution = nextAdaptiveResolution;
    }
    performanceAccumulator = 0;
    frameCount = 0;
  }
});

const onResize = () => app.resizeCanvas();
const onVisibilityChange = () => {
  if (document.hidden) {
    performanceAccumulator = 0;
    frameCount = 0;
    adaptiveResolution = resetAdaptiveResolutionSamples(adaptiveResolution);
  }
  soundscape.setHidden(document.hidden);
};
const teardown = () => {
  if (disposed) return;
  disposed = true;
  if (readyRetryId !== null) window.clearInterval(readyRetryId);
  if (standaloneBootTimer !== null) window.clearTimeout(standaloneBootTimer);
  clearOrbit();
  resetTouchMove();
  canvas.removeEventListener("pointerdown", onOrbitStart);
  canvas.removeEventListener("pointermove", onOrbitMove);
  canvas.removeEventListener("pointerup", onOrbitEnd);
  canvas.removeEventListener("pointercancel", onOrbitEnd);
  canvas.removeEventListener("lostpointercapture", onOrbitEnd);
  canvas.removeEventListener("wheel", onCameraWheel);
  canvas.removeEventListener("contextmenu", stopContextMenu);
  touchPad?.removeEventListener("pointerdown", onTouchMoveStart);
  touchPad?.removeEventListener("pointermove", onTouchMove);
  touchPad?.removeEventListener("pointerup", onTouchMoveEnd);
  touchPad?.removeEventListener("pointercancel", onTouchMoveEnd);
  touchPad?.removeEventListener("lostpointercapture", onTouchMoveEnd);
  touchAction?.removeEventListener("click", onTouchAction);
  audioToggle?.removeEventListener("click", onAudioToggle);
  window.removeEventListener("blur", onWindowBlur);
  window.removeEventListener("pointerdown", onTrustedAudioGesture, true);
  window.removeEventListener("keydown", onTrustedAudioGesture, true);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onActionKey);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("error", reportFatal);
  window.removeEventListener("unhandledrejection", reportFatal);
  soundscape.destroy();
  bridge.destroy();
  app.destroy();
};
const onPageHide = (event: PageTransitionEvent) => {
  if (!event.persisted) teardown();
};

window.addEventListener("resize", onResize);
document.addEventListener("visibilitychange", onVisibilityChange);
window.addEventListener("beforeunload", teardown, { once: true });
window.addEventListener("pagehide", onPageHide, { once: true });
