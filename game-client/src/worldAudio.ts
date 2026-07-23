import type * as pc from "playcanvas";

export type AudioState = "locked" | "running" | "muted" | "unsupported";

export type AudioAnchorId =
  | "arrival-water-left"
  | "arrival-water-right"
  | "market-water"
  | "market-fabric-left"
  | "market-fabric-right"
  | "market-performance"
  | "garden-water"
  | "garden-loom"
  | "garden-bowl"
  | "garden-dais";

type Point = { x: number; z: number };
type PlaceId = "conservatory" | "market" | "resonance";
type ActivityId = "listening-crescent" | "resonance-duet";

type AmbientVoice = {
  anchor: AudioAnchorId;
  gain: GainNode;
  panner: StereoPannerNode;
  source: AudioBufferSourceNode;
  maxGain: number;
  range: number;
};

type DroneVoice = {
  gain: GainNode;
  oscillators: OscillatorNode[];
  maxGain: number;
};

const STORAGE_KEY = "datescape:afterlight:sound:v1";
const MASTER_GAIN = 0.72;

const DEFAULT_ANCHORS: Record<AudioAnchorId, Point> = {
  "arrival-water-left": { x: -3.92, z: 26 },
  "arrival-water-right": { x: 3.92, z: 26 },
  "market-water": { x: 6.28, z: 3.6 },
  "market-fabric-left": { x: -4.25, z: 0.75 },
  "market-fabric-right": { x: 4.25, z: 1.4 },
  "market-performance": { x: -3.55, z: 7.05 },
  "garden-water": { x: 0, z: -18.1 },
  "garden-loom": { x: 0, z: -14.35 },
  "garden-bowl": { x: -4.4, z: -12.38 },
  "garden-dais": { x: -4.28, z: -16.27 },
};

const PLACE_CENTERS: Record<PlaceId, Point & { radius: number }> = {
  conservatory: { x: 0, z: 25, radius: 17 },
  market: { x: 0, z: 3.5, radius: 15 },
  resonance: { x: 0, z: -14.3, radius: 14 },
};

const PLACE_SCALES: Record<PlaceId, number[]> = {
  conservatory: [196, 246.94, 293.66, 392],
  market: [220, 277.18, 329.63, 440, 554.37],
  resonance: [261.63, 311.13, 392, 466.16, 523.25],
};

const PLACE_INTERVALS: Record<PlaceId, number> = {
  conservatory: 6.4,
  market: 3.8,
  resonance: 4.7,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function writePreference(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Audio remains usable when storage is unavailable (private browsing, etc.).
  }
}

function proximity(x: number, z: number, center: Point, radius: number) {
  const distance = Math.hypot(x - center.x, z - center.z);
  const linear = clamp(1 - distance / radius, 0, 1);
  return linear * linear;
}

function createNoiseBuffer(context: AudioContext) {
  const durationSeconds = 4;
  const buffer = context.createBuffer(
    1,
    context.sampleRate * durationSeconds,
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  let smoothed = 0;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    smoothed = smoothed * 0.965 + white * 0.035;
    samples[index] = clamp(smoothed * 2.8, -1, 1);
  }
  return buffer;
}

function stopSource(source: AudioScheduledSourceNode) {
  try {
    source.stop();
  } catch {
    // A source may already have ended; disconnecting it below is still safe.
  }
  source.disconnect();
}

export class AfterlightSoundscape {
  private readonly app: pc.Application;
  private readonly onStateChange: (state: AudioState) => void;
  private readonly anchors = new Map<AudioAnchorId, Point>(
    Object.entries(DEFAULT_ANCHORS) as Array<[AudioAnchorId, Point]>,
  );
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientVoices: AmbientVoice[] = [];
  private droneVoices = new Map<PlaceId, DroneVoice>();
  private transientSources = new Set<AudioScheduledSourceNode>();
  private contextStateHandler: (() => void) | null = null;
  private enabled: boolean;
  private readonly persistPreference: boolean;
  private paused = false;
  private hidden = false;
  private destroyed = false;
  private starting = false;
  private activity: ActivityId | null = null;
  private nextNoteAt = 0;
  private noteIndex = 0;
  private playerX = 0;
  private playerZ = 30;
  private cameraYaw = 0;
  private lastMixAt = Number.NEGATIVE_INFINITY;
  private weights: Record<PlaceId, number> = {
    conservatory: 1,
    market: 0,
    resonance: 0,
  };

  constructor(
    app: pc.Application,
    onStateChange: (state: AudioState) => void,
    options: { enabled?: boolean; persistPreference?: boolean } = {},
  ) {
    this.app = app;
    this.onStateChange = onStateChange;
    this.enabled = options.enabled ?? readPreference();
    this.persistPreference = options.persistPreference ?? true;
    this.emitState();
  }

  get state(): AudioState {
    if (!this.enabled) return "muted";
    if (this.context?.state === "running") return "running";
    if (this.context?.state === "closed") return "unsupported";
    return "locked";
  }

  setAnchor(id: AudioAnchorId, point: Point) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    this.anchors.set(id, { x: point.x, z: point.z });
  }

  setActivity(activity: ActivityId | null) {
    if (activity === this.activity) return;
    this.activity = activity;
    if (activity) {
      this.nextNoteAt = Math.min(
        this.nextNoteAt,
        (this.context?.currentTime ?? 0) + 0.35,
      );
    }
    this.applyMasterGain();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.applyMasterGain();
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.applyMasterGain();
  }

  async setEnabled(enabled: boolean, fromUserGesture = false) {
    if (this.destroyed) return false;
    this.enabled = enabled;
    if (this.persistPreference) writePreference(enabled);

    if (!enabled) {
      this.applyMasterGain();
      this.emitState();
      return true;
    }

    if (!fromUserGesture) {
      this.applyMasterGain();
      this.emitState();
      return this.context?.state === "running";
    }

    return this.beginFromGesture();
  }

  async toggleFromGesture() {
    return this.setEnabled(this.state !== "running", true);
  }

  async beginFromGesture() {
    if (!this.enabled || this.destroyed || this.starting) return false;
    this.starting = true;
    const context = this.ensureContext();
    if (!context) {
      this.emitState("unsupported");
      this.starting = false;
      return false;
    }

    try {
      if (context.state !== "running") await context.resume();
    } catch {
      this.emitState();
      this.starting = false;
      return false;
    }

    if (context.state !== "running") {
      this.emitState();
      this.starting = false;
      return false;
    }

    try {
      this.ensureGraph(context);
      this.applyMasterGain();
      this.nextNoteAt = Math.max(this.nextNoteAt, context.currentTime + 0.65);
      this.emitState();
      return true;
    } catch {
      this.emitState("unsupported");
      return false;
    } finally {
      this.starting = false;
    }
  }

  update(x: number, z: number, cameraYawDegrees: number) {
    this.playerX = x;
    this.playerZ = z;
    this.cameraYaw = cameraYawDegrees * (Math.PI / 180);
    this.weights = {
      conservatory: proximity(
        x,
        z,
        PLACE_CENTERS.conservatory,
        PLACE_CENTERS.conservatory.radius,
      ),
      market: proximity(
        x,
        z,
        PLACE_CENTERS.market,
        PLACE_CENTERS.market.radius,
      ),
      resonance: proximity(
        x,
        z,
        PLACE_CENTERS.resonance,
        PLACE_CENTERS.resonance.radius,
      ),
    };

    const context = this.context;
    if (!context || context.state !== "running" || !this.master) return;
    const now = context.currentTime;

    if (now - this.lastMixAt >= 0.06) {
      this.lastMixAt = now;
      this.ambientVoices.forEach((voice) => {
        const anchor = this.anchors.get(voice.anchor)!;
        const attenuation = proximity(x, z, anchor, voice.range);
        voice.gain.gain.setTargetAtTime(
          attenuation * voice.maxGain,
          now,
          0.28,
        );
        voice.panner.pan.setTargetAtTime(this.panFor(anchor), now, 0.18);
      });

      this.droneVoices.forEach((voice, place) => {
        voice.gain.gain.setTargetAtTime(
          this.weights[place] * voice.maxGain,
          now,
          0.45,
        );
      });
    }

    if (
      !this.enabled ||
      this.hidden ||
      (this.paused && !this.activity) ||
      now < this.nextNoteAt
    )
      return;
    const place =
      this.activity === "listening-crescent"
        ? "market"
        : this.activity === "resonance-duet"
          ? "resonance"
          : this.dominantPlace();
    if (this.weights[place] < 0.035) {
      this.nextNoteAt = now + 2;
      return;
    }

    const scale = PLACE_SCALES[place];
    const frequency = scale[this.noteIndex % scale.length];
    const anchor = this.musicalAnchor(place);
    const activityBoost = this.activity ? 1.2 : 1;
    this.playBell(frequency, anchor, 0.018 * activityBoost, 1.8);
    this.noteIndex += place === "market" ? 2 : 1;
    this.nextNoteAt =
      now +
      (this.activity === "resonance-duet"
        ? 2.7
        : this.activity === "listening-crescent"
          ? 3.2
          : PLACE_INTERVALS[place]) +
      (this.noteIndex % 3) * 0.32;
  }

  playLandmarkCue(place: PlaceId) {
    if (this.state !== "running") return;
    const scale = PLACE_SCALES[place];
    const frequency = scale[(this.noteIndex + 2) % scale.length];
    this.playBell(frequency, this.musicalAnchor(place), 0.022, 1.2);
    this.noteIndex += 1;
  }

  playInteractionCue(place: PlaceId | null) {
    if (this.state !== "running") return;
    const resolvedPlace = place ?? this.dominantPlace();
    const scale = PLACE_SCALES[resolvedPlace];
    const root = scale[this.noteIndex % scale.length];
    this.playBell(root, this.musicalAnchor(resolvedPlace), 0.026, 0.9);
    this.playBell(root * 1.5, this.musicalAnchor(resolvedPlace), 0.012, 1.25, 0.08);
    this.noteIndex += 1;
  }

  playJourneyCompleteCue() {
    if (this.state !== "running") return;
    const place = this.dominantPlace();
    const scale = PLACE_SCALES[place];
    const anchor = this.musicalAnchor(place);
    const notes = [scale[0], scale[2], scale[Math.min(3, scale.length - 1)]];
    notes.forEach((frequency, index) => {
      this.playBell(frequency, anchor, 0.018 - index * 0.002, 1.9, index * 0.14);
    });
    this.noteIndex += 2;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.context && this.contextStateHandler) {
      this.context.removeEventListener("statechange", this.contextStateHandler);
    }
    this.contextStateHandler = null;
    this.ambientVoices.forEach(({ source }) => stopSource(source));
    this.ambientVoices = [];
    this.droneVoices.forEach(({ oscillators }) =>
      oscillators.forEach(stopSource),
    );
    this.droneVoices.clear();
    this.transientSources.forEach(stopSource);
    this.transientSources.clear();
    this.master?.disconnect();
    this.master = null;
    this.context = null;
  }

  private ensureContext() {
    if (this.context) return this.context;
    const context = this.app.soundManager.context;
    if (!context) return null;
    this.context = context;
    this.contextStateHandler = () => this.emitState();
    context.addEventListener("statechange", this.contextStateHandler);
    return context;
  }

  private ensureGraph(context: AudioContext) {
    if (this.master) return;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.015;
    compressor.release.value = 0.35;

    this.master = context.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(compressor);
    compressor.connect(context.destination);

    const noise = createNoiseBuffer(context);
    this.ambientVoices = [
      this.createAmbientVoice(context, noise, "arrival-water-left", 0.034, 17, 820, 0.71),
      this.createAmbientVoice(context, noise, "arrival-water-right", 0.034, 17, 900, 0.74),
      this.createAmbientVoice(context, noise, "market-water", 0.038, 10, 1450, 1.08),
      this.createAmbientVoice(context, noise, "market-fabric-left", 0.018, 7.5, 2350, 1.22, "highpass"),
      this.createAmbientVoice(context, noise, "market-fabric-right", 0.018, 7.5, 2100, 1.17, "highpass"),
      this.createAmbientVoice(context, noise, "garden-water", 0.048, 13, 1050, 0.84),
    ];

    this.droneVoices.set(
      "conservatory",
      this.createDrone(context, [98, 147], 0.009),
    );
    this.droneVoices.set(
      "market",
      this.createDrone(context, [110, 164.81], 0.012),
    );
    this.droneVoices.set(
      "resonance",
      this.createDrone(context, [130.81, 196], 0.011),
    );
  }

  private createAmbientVoice(
    context: AudioContext,
    buffer: AudioBuffer,
    anchor: AudioAnchorId,
    maxGain: number,
    range: number,
    filterFrequency: number,
    playbackRate: number,
    filterType: BiquadFilterType = "lowpass",
  ): AmbientVoice {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = playbackRate;
    filter.type = filterType;
    filter.frequency.value = filterFrequency;
    filter.Q.value = filterType === "highpass" ? 0.4 : 0.75;
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.master!);
    source.start();
    return { anchor, gain, panner, source, maxGain, range };
  }

  private createDrone(
    context: AudioContext,
    frequencies: number[],
    maxGain: number,
  ): DroneVoice {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 0 ? -4 : 4;
      voiceGain.gain.value = index === 0 ? 0.65 : 0.19;
      oscillator.connect(voiceGain);
      voiceGain.connect(gain);
      oscillator.start();
      return oscillator;
    });
    return { gain, oscillators, maxGain };
  }

  private playBell(
    frequency: number,
    anchor: Point,
    peak: number,
    duration: number,
    delay = 0,
  ) {
    const context = this.context;
    if (!context || context.state !== "running" || !this.master) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const overtone = context.createOscillator();
    const oscillatorGain = context.createGain();
    const overtoneGain = context.createGain();
    const envelope = context.createGain();
    const panner = context.createStereoPanner();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    overtone.type = "sine";
    overtone.frequency.value = frequency * 2.01;
    oscillatorGain.gain.value = 0.82;
    overtoneGain.gain.value = 0.18;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    panner.pan.value = this.panFor(anchor);

    oscillator.connect(oscillatorGain);
    overtone.connect(overtoneGain);
    oscillatorGain.connect(envelope);
    overtoneGain.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.master);

    const end = start + duration + 0.05;
    this.transientSources.add(oscillator);
    this.transientSources.add(overtone);
    const cleanup = () => {
      this.transientSources.delete(oscillator);
      this.transientSources.delete(overtone);
      oscillator.disconnect();
      overtone.disconnect();
      oscillatorGain.disconnect();
      overtoneGain.disconnect();
      envelope.disconnect();
      panner.disconnect();
    };
    oscillator.addEventListener("ended", cleanup, { once: true });
    oscillator.start(start);
    overtone.start(start);
    oscillator.stop(end);
    overtone.stop(end);
  }

  private musicalAnchor(place: PlaceId) {
    if (place === "market") return this.anchors.get("market-performance")!;
    if (place === "resonance") {
      const gardenAnchors: AudioAnchorId[] = [
        "garden-loom",
        "garden-bowl",
        "garden-dais",
      ];
      return this.anchors.get(
        gardenAnchors[this.noteIndex % gardenAnchors.length],
      )!;
    }
    return this.anchors.get(
      this.noteIndex % 2 === 0 ? "arrival-water-left" : "arrival-water-right",
    )!;
  }

  private dominantPlace(): PlaceId {
    return (Object.entries(this.weights) as Array<[PlaceId, number]>).reduce(
      (best, candidate) => (candidate[1] > best[1] ? candidate : best),
    )[0];
  }

  private panFor(anchor: Point) {
    const dx = anchor.x - this.playerX;
    const dz = anchor.z - this.playerZ;
    const rightward = dx * Math.cos(this.cameraYaw) - dz * Math.sin(this.cameraYaw);
    return clamp(rightward / 9, -0.82, 0.82);
  }

  private applyMasterGain() {
    if (!this.context || !this.master) return;
    const activityLevel = this.activity ? 0.48 : 0.2;
    const target =
      this.enabled && !this.hidden
        ? MASTER_GAIN * (this.paused ? activityLevel : 1)
        : 0.0001;
    this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.08);
  }

  private emitState(override?: AudioState) {
    this.onStateChange(override ?? this.state);
  }
}
