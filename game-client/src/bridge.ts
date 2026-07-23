export const WORLD_SCOPE = "datescape-world";
export const WORLD_PROTOCOL_VERSION = 2;

export type AvatarAppearance = {
  v: 1;
  frame: "narrow" | "balanced" | "broad";
  skinTone:
    | "deep-umber"
    | "rich-sienna"
    | "warm-ochre"
    | "golden-sand"
    | "light-almond";
  hairStyle: "asymmetric-bob";
  hairColor: "blue-black" | "espresso" | "chestnut" | "copper";
  outfit: {
    base: "promenade-v1";
    palette: "pearl-tide" | "coral-dusk" | "garden-glass";
    trim: "accent" | "minimal" | "sunthread" | "rainlight";
  };
  accessory: "aged-bronze-fittings" | "lanternkeeper-charm" | "none";
};

export const DEFAULT_AVATAR_APPEARANCE: AvatarAppearance = Object.freeze({
  v: 1,
  frame: "balanced",
  skinTone: "warm-ochre",
  hairStyle: "asymmetric-bob",
  hairColor: "blue-black",
  outfit: Object.freeze({
    base: "promenade-v1",
    palette: "pearl-tide",
    trim: "accent",
  }),
  accessory: "aged-bronze-fittings",
});

export type PublicPlayer = {
  uid: string;
  name: string;
  color: string;
  intent?: string;
  appearance: AvatarAppearance;
  x: number;
  z: number;
  heading?: number;
  speed?: number;
};

export type BootPayload = {
  room: string;
  player: Pick<PublicPlayer, "name" | "color" | "intent" | "appearance">;
  remotePlayers: PublicPlayer[];
};

export type AvatarUpdatedPayload = Pick<
  PublicPlayer,
  "color" | "appearance"
>;

export type ActivityState = {
  id: "listening-crescent" | "resonance-duet";
  active: true;
  slot: 0 | 1;
  phase: "waiting" | "playing" | "resolved";
};

export type JourneyLandmarkId = "conservatory" | "market" | "resonance";
export type JourneyStage = "wander" | "moment" | "choice" | "complete";
export type JourneyState = {
  id: string;
  visited: JourneyLandmarkId[];
  stage: JourneyStage;
  complete: boolean;
};

export type QuestState = {
  questId: string;
  nodeId: string;
  targetLandmarkId: JourneyLandmarkId;
  status: "active" | "ready-to-turn-in";
};

export type PublicEventState = {
  id: "rainlight-relay";
  instanceId: string;
  phase: "idle" | "gathering" | "echo-available" | "completed" | "cooldown";
  startedAt: number | null;
  echoAvailableAt: number | null;
  completedAt: number | null;
  cooldownEndsAt: number | null;
  contributionCount: number;
  targetCount: 4;
  contributorCount: number;
  sourceCount: number;
  sourceCounts: {
    conservatory: number;
    market: number;
    resonance: number;
  };
  resultMode: null | "community" | "echo";
};

export type ExpeditionStatus =
  | "idle"
  | "forming"
  | "active"
  | "completed"
  | "expired";
export type ExpeditionStageId =
  | "conservatory-scan"
  | "market-lanterns"
  | "resonance-chime"
  | "complete";
export type ExpeditionTargetId =
  | "conservatory-scan"
  | "market-west"
  | "market-east"
  | "resonance-left"
  | "resonance-right";
export type ExpeditionState = {
  id: "lanternkeeper-expedition";
  instanceId: string | null;
  revision: number;
  status: ExpeditionStatus;
  stageId: ExpeditionStageId | null;
  memberCount: number;
  maxMembers: number;
  expiresAt: number | null;
  echoAvailableAt: number | null;
  resultMode: "standard" | "echo" | null;
  completedTargetIds: ExpeditionTargetId[];
  personal: {
    joined: boolean;
    completedTargetIds: ExpeditionTargetId[];
    availableTargetIds: ExpeditionTargetId[];
    canUseEcho: boolean;
  };
  serverNow: number;
};

type Envelope = {
  scope: typeof WORLD_SCOPE;
  version: typeof WORLD_PROTOCOL_VERSION;
  type: string;
  payload?: unknown;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_PUBLIC_EVENT_INSTANCE_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const SAFE_EXPEDITION_INSTANCE_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const ALLOWED_INTENTS = new Set(["meet", "friends", "match", "solo"]);
const ALLOWED_AVATAR_FRAMES = new Set<AvatarAppearance["frame"]>([
  "narrow",
  "balanced",
  "broad",
]);
const ALLOWED_SKIN_TONES = new Set<AvatarAppearance["skinTone"]>([
  "deep-umber",
  "rich-sienna",
  "warm-ochre",
  "golden-sand",
  "light-almond",
]);
const ALLOWED_HAIR_COLORS = new Set<AvatarAppearance["hairColor"]>([
  "blue-black",
  "espresso",
  "chestnut",
  "copper",
]);
const ALLOWED_OUTFIT_PALETTES = new Set<
  AvatarAppearance["outfit"]["palette"]
>(["pearl-tide", "coral-dusk", "garden-glass"]);
const ALLOWED_OUTFIT_TRIMS = new Set<AvatarAppearance["outfit"]["trim"]>([
  "accent",
  "minimal",
  "sunthread",
  "rainlight",
]);
const ALLOWED_ACTIVITY_PHASES = new Set<ActivityState["phase"]>([
  "waiting",
  "playing",
  "resolved",
]);
const ALLOWED_JOURNEY_LANDMARKS = new Set<JourneyLandmarkId>([
  "conservatory",
  "market",
  "resonance",
]);
const ALLOWED_JOURNEY_STAGES = new Set<JourneyStage>([
  "wander",
  "moment",
  "choice",
  "complete",
]);
const ALLOWED_PUBLIC_EVENT_PHASES = new Set<PublicEventState["phase"]>([
  "idle",
  "gathering",
  "echo-available",
  "completed",
  "cooldown",
]);
const ALLOWED_EXPEDITION_STATUSES = new Set<ExpeditionStatus>([
  "idle",
  "forming",
  "active",
  "completed",
  "expired",
]);
const ALLOWED_EXPEDITION_STAGES = new Set<ExpeditionStageId>([
  "conservatory-scan",
  "market-lanterns",
  "resonance-chime",
  "complete",
]);
export const EXPEDITION_TARGET_IDS = Object.freeze([
  "conservatory-scan",
  "market-west",
  "market-east",
  "resonance-left",
  "resonance-right",
] as const satisfies readonly ExpeditionTargetId[]);
const ALLOWED_EXPEDITION_TARGETS = new Set<ExpeditionTargetId>(
  EXPEDITION_TARGET_IDS,
);
const EXPEDITION_TARGET_STAGE: Record<
  ExpeditionTargetId,
  ExpeditionStageId
> = Object.freeze({
  "conservatory-scan": "conservatory-scan",
  "market-west": "market-lanterns",
  "market-east": "market-lanterns",
  "resonance-left": "resonance-chime",
  "resonance-right": "resonance-chime",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

export function isAvatarAppearance(value: unknown): value is AvatarAppearance {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      "v",
      "frame",
      "skinTone",
      "hairStyle",
      "hairColor",
      "outfit",
      "accessory",
    ])
  ) {
    return false;
  }
  if (!isRecord(value.outfit)) return false;
  if (!hasExactKeys(value.outfit, ["base", "palette", "trim"])) return false;

  return Boolean(
    value.v === 1 &&
      typeof value.frame === "string" &&
      ALLOWED_AVATAR_FRAMES.has(value.frame as AvatarAppearance["frame"]) &&
      typeof value.skinTone === "string" &&
      ALLOWED_SKIN_TONES.has(
        value.skinTone as AvatarAppearance["skinTone"],
      ) &&
      value.hairStyle === "asymmetric-bob" &&
      typeof value.hairColor === "string" &&
      ALLOWED_HAIR_COLORS.has(
        value.hairColor as AvatarAppearance["hairColor"],
      ) &&
      value.outfit.base === "promenade-v1" &&
      typeof value.outfit.palette === "string" &&
      ALLOWED_OUTFIT_PALETTES.has(
        value.outfit.palette as AvatarAppearance["outfit"]["palette"],
      ) &&
      typeof value.outfit.trim === "string" &&
      ALLOWED_OUTFIT_TRIMS.has(
        value.outfit.trim as AvatarAppearance["outfit"]["trim"],
      ) &&
      (value.accessory === "aged-bronze-fittings" ||
        value.accessory === "lanternkeeper-charm" ||
        value.accessory === "none"),
  );
}

function cloneAvatarAppearance(value: AvatarAppearance): AvatarAppearance {
  return { ...value, outfit: { ...value.outfit } };
}

function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Envelope>;
  return (
    candidate.scope === WORLD_SCOPE &&
    candidate.version === WORLD_PROTOCOL_VERSION &&
    typeof candidate.type === "string"
  );
}

function safeWebOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function resolveParentOrigin() {
  const configuredOrigin = safeWebOrigin(import.meta.env.VITE_SHELL_ORIGIN);
  if (configuredOrigin) return configuredOrigin;
  return safeWebOrigin(document.referrer) || window.location.origin;
}

function isRemotePlayer(value: unknown): value is PublicPlayer {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(
      value,
      new Set([
        "uid",
        "name",
        "color",
        "intent",
        "appearance",
        "x",
        "z",
        "heading",
        "speed",
      ]),
    )
  ) {
    return false;
  }
  const player = value as Partial<PublicPlayer>;
  return Boolean(
    typeof player.uid === "string" &&
    player.uid.length > 0 &&
    player.uid.length <= 128 &&
    typeof player.name === "string" &&
    player.name.length <= 22 &&
    typeof player.color === "string" &&
    HEX_COLOR.test(player.color) &&
    (!player.intent || ALLOWED_INTENTS.has(player.intent)) &&
    isAvatarAppearance(player.appearance) &&
    Number.isFinite(player.x) &&
    Math.abs(player.x!) <= 60 &&
    Number.isFinite(player.z) &&
    Math.abs(player.z!) <= 60 &&
    (player.heading === undefined ||
      (Number.isFinite(player.heading) &&
        Math.abs(player.heading) <= Math.PI * 2)) &&
    (player.speed === undefined ||
      (Number.isFinite(player.speed) &&
        player.speed >= 0 &&
        player.speed <= 12)),
  );
}

function isRemotePlayerList(value: unknown): value is PublicPlayer[] {
  return (
    Array.isArray(value) && value.length <= 64 && value.every(isRemotePlayer)
  );
}

function isBootPayload(value: unknown): value is BootPayload {
  if (!isRecord(value) || !hasExactKeys(value, ["room", "player", "remotePlayers"]))
    return false;
  const payload = value as Partial<BootPayload>;
  const player = payload.player;
  return Boolean(
    typeof payload.room === "string" &&
    payload.room.length > 0 &&
    payload.room.length <= 128 &&
    player &&
    isRecord(player) &&
    hasOnlyKeys(player, new Set(["name", "color", "intent", "appearance"])) &&
    typeof player.name === "string" &&
    player.name.length <= 22 &&
    typeof player.color === "string" &&
    HEX_COLOR.test(player.color) &&
    (!player.intent || ALLOWED_INTENTS.has(player.intent)) &&
    isAvatarAppearance(player.appearance) &&
    isRemotePlayerList(payload.remotePlayers),
  );
}

function isAvatarUpdatedPayload(value: unknown): value is AvatarUpdatedPayload {
  if (!isRecord(value) || !hasExactKeys(value, ["color", "appearance"]))
    return false;
  return Boolean(
    typeof value.color === "string" &&
      HEX_COLOR.test(value.color) &&
      isAvatarAppearance(value.appearance),
  );
}

function isActivityState(value: unknown): value is ActivityState {
  if (!value || typeof value !== "object") return false;
  const activity = value as Partial<ActivityState>;
  return Boolean(
    (activity.id === "listening-crescent" ||
      activity.id === "resonance-duet") &&
      activity.active === true &&
      (activity.slot === 0 || activity.slot === 1) &&
      typeof activity.phase === "string" &&
      ALLOWED_ACTIVITY_PHASES.has(activity.phase as ActivityState["phase"]),
  );
}

function isJourneyState(value: unknown): value is JourneyState {
  if (!value || typeof value !== "object") return false;
  const journey = value as Partial<JourneyState>;
  return Boolean(
    typeof journey.id === "string" &&
    journey.id.trim().length > 0 &&
    journey.id.length <= 128 &&
    Array.isArray(journey.visited) &&
    journey.visited.length <= ALLOWED_JOURNEY_LANDMARKS.size &&
    new Set(journey.visited).size === journey.visited.length &&
    journey.visited.every((id) => ALLOWED_JOURNEY_LANDMARKS.has(id)) &&
    typeof journey.stage === "string" &&
    ALLOWED_JOURNEY_STAGES.has(journey.stage as JourneyStage) &&
    typeof journey.complete === "boolean" &&
    journey.complete === (journey.stage === "complete"),
  );
}

function isQuestState(value: unknown): value is QuestState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "questId",
      "nodeId",
      "targetLandmarkId",
      "status",
    ])
  ) {
    return false;
  }
  return Boolean(
    typeof value.questId === "string" &&
      value.questId.trim().length > 0 &&
      value.questId.length <= 128 &&
      typeof value.nodeId === "string" &&
      value.nodeId.trim().length > 0 &&
      value.nodeId.length <= 128 &&
      typeof value.targetLandmarkId === "string" &&
      ALLOWED_JOURNEY_LANDMARKS.has(
        value.targetLandmarkId as JourneyLandmarkId,
      ) &&
      (value.status === "active" || value.status === "ready-to-turn-in"),
  );
}

function isNullableSafeTime(value: unknown) {
  return value === null || (Number.isFinite(value) && Number(value) >= 0);
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number) {
  return (
    Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
  );
}

export function isPublicEventState(value: unknown): value is PublicEventState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "instanceId",
      "phase",
      "startedAt",
      "echoAvailableAt",
      "completedAt",
      "cooldownEndsAt",
      "contributionCount",
      "targetCount",
      "contributorCount",
      "sourceCount",
      "sourceCounts",
      "resultMode",
    ]) ||
    !isRecord(value.sourceCounts) ||
    !hasExactKeys(value.sourceCounts, [
      "conservatory",
      "market",
      "resonance",
    ])
  ) {
    return false;
  }

  const sourceCounts = value.sourceCounts;
  const sourceInputs = [
    sourceCounts.conservatory,
    sourceCounts.market,
    sourceCounts.resonance,
  ];
  const sourceValues = sourceInputs.map((count) => Number(count));
  const positiveSourceCount = sourceValues.filter(
    (count) => count > 0,
  ).length;
  const totalSourceContributions = sourceValues.reduce(
    (total, count) => total + count,
    0,
  );

  return Boolean(
      value.id === "rainlight-relay" &&
      typeof value.instanceId === "string" &&
      SAFE_PUBLIC_EVENT_INSTANCE_ID.test(value.instanceId) &&
      typeof value.phase === "string" &&
      ALLOWED_PUBLIC_EVENT_PHASES.has(value.phase as PublicEventState["phase"]) &&
      isNullableSafeTime(value.startedAt) &&
      isNullableSafeTime(value.echoAvailableAt) &&
      isNullableSafeTime(value.completedAt) &&
      isNullableSafeTime(value.cooldownEndsAt) &&
      isBoundedInteger(value.contributionCount, 0, 4) &&
      value.targetCount === 4 &&
      isBoundedInteger(value.contributorCount, 0, 64) &&
      isBoundedInteger(value.sourceCount, 0, 3) &&
      sourceInputs.every((count) => isBoundedInteger(count, 0, 2)) &&
      value.sourceCount === positiveSourceCount &&
      value.contributionCount === totalSourceContributions &&
      (value.resultMode === null ||
        value.resultMode === "community" ||
        value.resultMode === "echo"),
  );
}

function isExpeditionTargetList(value: unknown): value is ExpeditionTargetId[] {
  return Boolean(
    Array.isArray(value) &&
      value.length <= EXPEDITION_TARGET_IDS.length &&
      new Set(value).size === value.length &&
      value.every(
        (targetId) =>
          typeof targetId === "string" &&
          ALLOWED_EXPEDITION_TARGETS.has(targetId as ExpeditionTargetId),
      ),
  );
}

export function isExpeditionState(value: unknown): value is ExpeditionState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "instanceId",
      "revision",
      "status",
      "stageId",
      "memberCount",
      "maxMembers",
      "expiresAt",
      "echoAvailableAt",
      "resultMode",
      "completedTargetIds",
      "personal",
      "serverNow",
    ]) ||
    !isRecord(value.personal) ||
    !hasExactKeys(value.personal, [
      "joined",
      "completedTargetIds",
      "availableTargetIds",
      "canUseEcho",
    ])
  ) {
    return false;
  }

  const instanceIsSafe =
    value.instanceId === null ||
    (typeof value.instanceId === "string" &&
      SAFE_EXPEDITION_INSTANCE_ID.test(value.instanceId));
  const stageIsSafe =
    value.stageId === null ||
    (typeof value.stageId === "string" &&
      ALLOWED_EXPEDITION_STAGES.has(value.stageId as ExpeditionStageId));
  const resultIsSafe =
    value.resultMode === null ||
    value.resultMode === "standard" ||
    value.resultMode === "echo";
  const status = value.status as ExpeditionStatus;
  const completedTargetIds = value.completedTargetIds;
  const personalTargetIds = value.personal.completedTargetIds;
  const personalAvailableTargetIds = value.personal.availableTargetIds;
  const personalTargetsAreAggregate =
    isExpeditionTargetList(completedTargetIds) &&
    isExpeditionTargetList(personalTargetIds) &&
    personalTargetIds.every((targetId) => completedTargetIds.includes(targetId));
  const personalAvailabilityIsCoherent =
    isExpeditionTargetList(completedTargetIds) &&
    isExpeditionTargetList(personalAvailableTargetIds) &&
    personalAvailableTargetIds.every(
      (targetId) =>
        !completedTargetIds.includes(targetId) &&
        EXPEDITION_TARGET_STAGE[targetId] === value.stageId,
    );
  const isIdle = status === "idle";
  const isComplete = status === "completed";

  return Boolean(
    value.id === "lanternkeeper-expedition" &&
      instanceIsSafe &&
      Number.isSafeInteger(value.revision) &&
      Number(value.revision) >= 0 &&
      Number(value.revision) <= 2_147_483_647 &&
      typeof value.status === "string" &&
      ALLOWED_EXPEDITION_STATUSES.has(status) &&
      stageIsSafe &&
      isBoundedInteger(value.maxMembers, 1, 8) &&
      isBoundedInteger(value.memberCount, 0, Number(value.maxMembers)) &&
      isNullableSafeTime(value.expiresAt) &&
      isNullableSafeTime(value.echoAvailableAt) &&
      resultIsSafe &&
      personalTargetsAreAggregate &&
      personalAvailabilityIsCoherent &&
      typeof value.personal.joined === "boolean" &&
      typeof value.personal.canUseEcho === "boolean" &&
      Number.isSafeInteger(value.serverNow) &&
      Number(value.serverNow) >= 0 &&
      (isIdle ? value.instanceId === null && value.stageId === null : value.instanceId !== null) &&
      (isComplete ? value.stageId === "complete" && value.resultMode !== null : value.resultMode === null) &&
      (!value.personal.canUseEcho ||
        (status === "active" && value.personal.joined === true)) &&
      (value.personal.joined ||
        (personalTargetIds.length === 0 &&
          personalAvailableTargetIds.length === 0 &&
          value.personal.canUseEcho === false)) &&
      ((value.personal.joined &&
        (status === "forming" || status === "active")) ||
        personalAvailableTargetIds.length === 0),
  );
}

export class WorldBridge {
  private parentOrigin = resolveParentOrigin();
  private bootListeners = new Set<(payload: BootPayload) => void>();
  private remoteListeners = new Set<(players: PublicPlayer[]) => void>();
  private avatarListeners = new Set<
    (avatar: AvatarUpdatedPayload) => void
  >();
  private axisListeners = new Set<(axis: { x: number; z: number }) => void>();
  private pauseListeners = new Set<(paused: boolean) => void>();
  private activityListeners = new Set<
    (activity: ActivityState | null) => void
  >();
  private journeyListeners = new Set<(journey: JourneyState) => void>();
  private questListeners = new Set<(quest: QuestState | null) => void>();
  private publicEventListeners = new Set<
    (publicEvent: PublicEventState | null) => void
  >();
  private expeditionListeners = new Set<
    (expedition: ExpeditionState) => void
  >();
  private audioListeners = new Set<(enabled: boolean) => void>();

  constructor() {
    window.addEventListener("message", this.onMessage);
  }

  destroy() {
    window.removeEventListener("message", this.onMessage);
    this.bootListeners.clear();
    this.remoteListeners.clear();
    this.avatarListeners.clear();
    this.axisListeners.clear();
    this.pauseListeners.clear();
    this.activityListeners.clear();
    this.journeyListeners.clear();
    this.questListeners.clear();
    this.publicEventListeners.clear();
    this.expeditionListeners.clear();
    this.audioListeners.clear();
  }

  onBoot(listener: (payload: BootPayload) => void) {
    this.bootListeners.add(listener);
    return () => this.bootListeners.delete(listener);
  }

  onRemotePlayers(listener: (players: PublicPlayer[]) => void) {
    this.remoteListeners.add(listener);
    return () => this.remoteListeners.delete(listener);
  }

  onAvatarUpdated(listener: (avatar: AvatarUpdatedPayload) => void) {
    this.avatarListeners.add(listener);
    return () => this.avatarListeners.delete(listener);
  }

  onAxis(listener: (axis: { x: number; z: number }) => void) {
    this.axisListeners.add(listener);
    return () => this.axisListeners.delete(listener);
  }

  onPause(listener: (paused: boolean) => void) {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }

  onActivity(listener: (activity: ActivityState | null) => void) {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  onJourney(listener: (journey: JourneyState) => void) {
    this.journeyListeners.add(listener);
    return () => this.journeyListeners.delete(listener);
  }

  onQuest(listener: (quest: QuestState | null) => void) {
    this.questListeners.add(listener);
    return () => this.questListeners.delete(listener);
  }

  onPublicEvent(listener: (publicEvent: PublicEventState | null) => void) {
    this.publicEventListeners.add(listener);
    return () => this.publicEventListeners.delete(listener);
  }

  onExpedition(listener: (expedition: ExpeditionState) => void) {
    this.expeditionListeners.add(listener);
    return () => this.expeditionListeners.delete(listener);
  }

  onAudioSettings(listener: (enabled: boolean) => void) {
    this.audioListeners.add(listener);
    return () => this.audioListeners.delete(listener);
  }

  send(type: string, payload?: unknown) {
    const target = window.parent === window ? window : window.parent;
    target.postMessage(
      { scope: WORLD_SCOPE, version: WORLD_PROTOCOL_VERSION, type, payload },
      this.parentOrigin,
    );
  }

  private onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== this.parentOrigin)
      return;
    if (!isEnvelope(event.data)) return;

    switch (event.data.type) {
      case "BOOT": {
        const payload = event.data.payload;
        if (!isBootPayload(payload)) return;
        this.bootListeners.forEach((listener) => listener(payload));
        break;
      }
      case "REMOTE_SNAPSHOTS": {
        const players = (event.data.payload as { players?: unknown })?.players;
        if (!isRemotePlayerList(players)) return;
        this.remoteListeners.forEach((listener) => listener(players));
        break;
      }
      case "AVATAR_UPDATED": {
        const avatar = event.data.payload;
        if (!isAvatarUpdatedPayload(avatar)) return;
        const safeAvatar: AvatarUpdatedPayload = {
          color: avatar.color,
          appearance: cloneAvatarAppearance(avatar.appearance),
        };
        this.avatarListeners.forEach((listener) => listener(safeAvatar));
        break;
      }
      case "INPUT_AXIS": {
        const axis = event.data.payload as { x?: number; z?: number };
        if (
          !Number.isFinite(axis?.x) ||
          !Number.isFinite(axis?.z) ||
          Math.abs(axis.x!) > 1 ||
          Math.abs(axis.z!) > 1
        )
          return;
        this.axisListeners.forEach((listener) =>
          listener({ x: axis.x!, z: axis.z! }),
        );
        break;
      }
      case "PAUSE":
        this.pauseListeners.forEach((listener) => listener(true));
        break;
      case "RESUME":
        this.pauseListeners.forEach((listener) => listener(false));
        break;
      case "ACTIVITY_STATE": {
        const activity = event.data.payload;
        if (activity === null) {
          this.activityListeners.forEach((listener) => listener(null));
          break;
        }
        if (!isActivityState(activity)) return;
        const safeActivity: ActivityState = {
          id: activity.id,
          active: true,
          slot: activity.slot,
          phase: activity.phase,
        };
        this.activityListeners.forEach((listener) => listener(safeActivity));
        break;
      }
      case "JOURNEY_STATE": {
        const journey = event.data.payload;
        if (!isJourneyState(journey)) return;
        const safeJourney = {
          ...journey,
          visited: [...journey.visited],
        };
        this.journeyListeners.forEach((listener) => listener(safeJourney));
        break;
      }
      case "QUEST_STATE": {
        const quest = event.data.payload;
        if (quest === null) {
          this.questListeners.forEach((listener) => listener(null));
          break;
        }
        if (!isQuestState(quest)) return;
        const safeQuest: QuestState = {
          questId: quest.questId,
          nodeId: quest.nodeId,
          targetLandmarkId: quest.targetLandmarkId,
          status: quest.status,
        };
        this.questListeners.forEach((listener) => listener(safeQuest));
        break;
      }
      case "PUBLIC_EVENT_STATE": {
        const publicEvent = event.data.payload;
        if (publicEvent === null) {
          this.publicEventListeners.forEach((listener) => listener(null));
          break;
        }
        if (!isPublicEventState(publicEvent)) return;
        const safePublicEvent: PublicEventState = {
          id: "rainlight-relay",
          instanceId: publicEvent.instanceId,
          phase: publicEvent.phase,
          startedAt: publicEvent.startedAt,
          echoAvailableAt: publicEvent.echoAvailableAt,
          completedAt: publicEvent.completedAt,
          cooldownEndsAt: publicEvent.cooldownEndsAt,
          contributionCount: publicEvent.contributionCount,
          targetCount: 4,
          contributorCount: publicEvent.contributorCount,
          sourceCount: publicEvent.sourceCount,
          sourceCounts: { ...publicEvent.sourceCounts },
          resultMode: publicEvent.resultMode,
        };
        this.publicEventListeners.forEach((listener) =>
          listener(safePublicEvent),
        );
        break;
      }
      case "EXPEDITION_STATE": {
        const expedition = event.data.payload;
        if (!isExpeditionState(expedition)) return;
        const safeExpedition: ExpeditionState = {
          id: "lanternkeeper-expedition",
          instanceId: expedition.instanceId,
          revision: expedition.revision,
          status: expedition.status,
          stageId: expedition.stageId,
          memberCount: expedition.memberCount,
          maxMembers: expedition.maxMembers,
          expiresAt: expedition.expiresAt,
          echoAvailableAt: expedition.echoAvailableAt,
          resultMode: expedition.resultMode,
          completedTargetIds: [...expedition.completedTargetIds],
          personal: {
            joined: expedition.personal.joined,
            completedTargetIds: [...expedition.personal.completedTargetIds],
            availableTargetIds: [...expedition.personal.availableTargetIds],
            canUseEcho: expedition.personal.canUseEcho,
          },
          serverNow: expedition.serverNow,
        };
        this.expeditionListeners.forEach((listener) =>
          listener(safeExpedition),
        );
        break;
      }
      case "AUDIO_SETTINGS": {
        const enabled = (event.data.payload as { enabled?: unknown })?.enabled;
        if (typeof enabled !== "boolean") return;
        this.audioListeners.forEach((listener) => listener(enabled));
        break;
      }
      default:
        break;
    }
  };
}
