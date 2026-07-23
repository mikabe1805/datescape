import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicAvatarAppearance } from "../../game/avatarAppearance";

const WORLD_SCOPE = "datescape-world";
const WORLD_PROTOCOL_VERSION = 2;
const DEFAULT_AVATAR_COLOR = "#d97967";
const ALLOWED_INTENTS = new Set(["meet", "friends", "match", "solo"]);
const ALLOWED_LANDMARKS = new Set(["conservatory", "market", "resonance"]);
const ALLOWED_JOURNEY_STAGES = new Set([
  "wander",
  "moment",
  "choice",
  "complete",
]);
const ALLOWED_ACTIONS = new Set(["interact", "emote", "chat", "escape"]);
const ALLOWED_AUDIO_STATES = new Set([
  "locked",
  "running",
  "muted",
  "unsupported",
]);
const ALLOWED_ACTIVITIES = new Set([
  "listening-crescent",
  "resonance-duet",
]);
const ALLOWED_ACTIVITY_PHASES = new Set(["waiting", "playing", "resolved"]);
const ALLOWED_QUEST_STATUSES = new Set(["active", "ready-to-turn-in"]);
const ALLOWED_PUBLIC_EVENT_PHASES = new Set([
  "idle",
  "gathering",
  "echo-available",
  "completed",
  "cooldown",
]);
const ALLOWED_PUBLIC_EVENT_RESULTS = new Set(["community", "echo"]);
const ALLOWED_EXPEDITION_STATUSES = new Set([
  "idle",
  "forming",
  "active",
  "completed",
  "expired",
]);
const ALLOWED_EXPEDITION_STAGES = new Set([
  "conservatory-scan",
  "market-lanterns",
  "resonance-chime",
  "complete",
]);
const ALLOWED_EXPEDITION_TARGETS = new Set([
  "conservatory-scan",
  "market-west",
  "market-east",
  "resonance-left",
  "resonance-right",
]);
const EXPEDITION_TARGETS_BY_STAGE = Object.freeze({
  "conservatory-scan": new Set(["conservatory-scan"]),
  "market-lanterns": new Set(["market-west", "market-east"]),
  "resonance-chime": new Set(["resonance-left", "resonance-right"]),
  complete: new Set(),
});
const ALLOWED_EXPEDITION_RESULTS = new Set(["standard", "echo"]);
const SAFE_PUBLIC_EVENT_INSTANCE_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const WORLD_READY_TIMEOUT_MS = 20_000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function publicProfile(profile) {
  return {
    name: String(profile?.name || "Wayfarer").slice(0, 22),
    color: HEX_COLOR.test(profile?.color)
      ? profile.color
      : DEFAULT_AVATAR_COLOR,
    intent: ALLOWED_INTENTS.has(profile?.intent) ? profile.intent : "solo",
    appearance: publicAvatarAppearance(profile?.appearance),
  };
}

function publicRemotePlayers(players) {
  if (!Array.isArray(players)) return [];
  return players
    .filter(
      (player) =>
        typeof player?.uid === "string" &&
        player.uid.length <= 128 &&
        Number.isFinite(player.x) &&
        Number.isFinite(player.z),
    )
    .slice(0, 64)
    .map((player) => ({
      uid: player.uid,
      name: String(player.name || "Wayfarer").slice(0, 22),
      color: HEX_COLOR.test(player.color) ? player.color : DEFAULT_AVATAR_COLOR,
      intent: ALLOWED_INTENTS.has(player.intent) ? player.intent : "solo",
      appearance: publicAvatarAppearance(player.appearance),
      x: clamp(player.x, -60, 60),
      z: clamp(player.z, -60, 60),
      heading: Number.isFinite(player.heading)
        ? clamp(player.heading, -Math.PI * 2, Math.PI * 2)
        : 0,
      speed: Number.isFinite(player.speed) ? clamp(player.speed, 0, 12) : 0,
    }));
}

function publicActivityState(value) {
  if (
    ALLOWED_ACTIVITIES.has(value?.id) &&
    value.active === true &&
    (value.slot === 0 || value.slot === 1) &&
    ALLOWED_ACTIVITY_PHASES.has(value?.phase)
  ) {
    return {
      id: value.id,
      active: true,
      slot: value.slot,
      phase: value.phase,
    };
  }
  return null;
}

function publicJourneyState(value) {
  const id = typeof value?.id === "string" ? value.id.trim() : "";
  if (
    !id ||
    id.length > 128 ||
    !ALLOWED_JOURNEY_STAGES.has(value?.stage) ||
    typeof value?.complete !== "boolean" ||
    value.complete !== (value.stage === "complete")
  ) {
    return null;
  }

  const visited = Array.isArray(value?.visited)
    ? [...new Set(value.visited.filter((id) => ALLOWED_LANDMARKS.has(id)))].slice(
        0,
        ALLOWED_LANDMARKS.size,
      )
    : [];

  return {
    id,
    visited,
    stage: value.stage,
    complete: value.complete === true,
  };
}

function publicQuestState(value) {
  const questId = typeof value?.questId === "string" ? value.questId : "";
  const nodeId = typeof value?.nodeId === "string" ? value.nodeId : "";
  if (
    !questId ||
    questId.length > 128 ||
    !nodeId ||
    nodeId.length > 128 ||
    !ALLOWED_LANDMARKS.has(value?.targetLandmarkId) ||
    !ALLOWED_QUEST_STATUSES.has(value?.status)
  ) {
    return null;
  }
  return {
    questId,
    nodeId,
    targetLandmarkId: value.targetLandmarkId,
    status: value.status,
  };
}

function nullableTime(value) {
  if (value === null) return null;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function publicWorldEventState(value) {
  if (!value?.instanceId || value.phase === "idle") return null;
  const startedAt = nullableTime(value.startedAt);
  const echoAvailableAt = nullableTime(value.echoAvailableAt);
  const completedAt = nullableTime(value.completedAt);
  const cooldownEndsAt = nullableTime(value.cooldownEndsAt);
  const sourceCounts = {
    conservatory: value.sourceCounts?.conservatory,
    market: value.sourceCounts?.market,
    resonance: value.sourceCounts?.resonance,
  };
  const counts = Object.values(sourceCounts);
  const validCounts = counts.every(
    (count) => Number.isInteger(count) && count >= 0 && count <= 2,
  );
  const contributionCount = counts.reduce((total, count) => total + count, 0);
  const sourceCount = counts.filter(Boolean).length;
  if (
    value.id !== "rainlight-relay" ||
    !SAFE_PUBLIC_EVENT_INSTANCE_ID.test(value.instanceId) ||
    !ALLOWED_PUBLIC_EVENT_PHASES.has(value.phase) ||
    startedAt === undefined ||
    echoAvailableAt === undefined ||
    completedAt === undefined ||
    cooldownEndsAt === undefined ||
    !validCounts ||
    !Number.isInteger(value.contributionCount) ||
    value.contributionCount !== contributionCount ||
    value.targetCount !== 4 ||
    !Number.isInteger(value.contributorCount) ||
    value.contributorCount < 0 ||
    value.contributorCount > 64 ||
    value.sourceCount !== sourceCount ||
    !(
      value.resultMode === null ||
      ALLOWED_PUBLIC_EVENT_RESULTS.has(value.resultMode)
    )
  ) {
    return null;
  }
  return {
    id: "rainlight-relay",
    instanceId: value.instanceId,
    phase: value.phase,
    startedAt,
    echoAvailableAt,
    completedAt,
    cooldownEndsAt,
    contributionCount,
    targetCount: 4,
    contributorCount: value.contributorCount,
    sourceCount,
    sourceCounts,
    resultMode: value.resultMode,
  };
}

function idleExpeditionState(serverNow = Date.now()) {
  return {
    id: "lanternkeeper-expedition",
    instanceId: null,
    revision: 0,
    status: "idle",
    stageId: null,
    memberCount: 0,
    maxMembers: 4,
    expiresAt: null,
    echoAvailableAt: null,
    resultMode: null,
    completedTargetIds: [],
    personal: {
      joined: false,
      completedTargetIds: [],
      availableTargetIds: [],
      canUseEcho: false,
    },
    serverNow,
  };
}

function publicExpeditionState(value) {
  const serverNow = Number.isFinite(value?.serverNow)
    ? value.serverNow
    : Date.now();
  if (!value || value.status === "idle") return idleExpeditionState(serverNow);
  const instanceId =
    typeof value.instanceId === "string" &&
    SAFE_PUBLIC_EVENT_INSTANCE_ID.test(value.instanceId)
      ? value.instanceId
      : null;
  const completedTargetIds = Array.isArray(value.completedTargetIds)
    ? [...new Set(value.completedTargetIds)].filter((targetId) =>
        ALLOWED_EXPEDITION_TARGETS.has(targetId),
      )
    : [];
  const personalCompletedTargetIds = Array.isArray(
    value.personal?.completedTargetIds,
  )
    ? [...new Set(value.personal.completedTargetIds)].filter((targetId) =>
        ALLOWED_EXPEDITION_TARGETS.has(targetId),
      )
    : [];
  const personalAvailableTargetIds = Array.isArray(
    value.personal?.availableTargetIds,
  )
    ? [...new Set(value.personal.availableTargetIds)].filter((targetId) =>
        ALLOWED_EXPEDITION_TARGETS.has(targetId),
      )
    : [];
  const expiresAt = nullableTime(value.expiresAt);
  const echoAvailableAt = nullableTime(value.echoAvailableAt);
  const completedTargets = new Set(completedTargetIds);
  const personalTargetsArePublic = personalCompletedTargetIds.every(
    (targetId) => completedTargets.has(targetId),
  );
  const stageTargets = EXPEDITION_TARGETS_BY_STAGE[value.stageId] || new Set();
  const personalAvailabilityIsCoherent = personalAvailableTargetIds.every(
    (targetId) =>
      stageTargets.has(targetId) && !completedTargets.has(targetId),
  );
  const activeStage =
    value.stageId === "conservatory-scan" ||
    value.stageId === "market-lanterns" ||
    value.stageId === "resonance-chime";
  const coherentLifecycle =
    ((value.status === "forming" || value.status === "active") &&
      activeStage &&
      value.resultMode === null) ||
    (value.status === "completed" &&
      value.stageId === "complete" &&
      ALLOWED_EXPEDITION_RESULTS.has(value.resultMode)) ||
    (value.status === "expired" &&
      value.stageId === null &&
      value.resultMode === null);
  const coherentTargets =
    (value.stageId !== "market-lanterns" ||
      completedTargets.has("conservatory-scan")) &&
    (value.stageId !== "resonance-chime" ||
      (completedTargets.has("conservatory-scan") &&
        completedTargets.has("market-west") &&
        completedTargets.has("market-east"))) &&
    (value.stageId !== "complete" ||
      ALLOWED_EXPEDITION_TARGETS.size === completedTargets.size);
  const valid = Boolean(
    value.id === "lanternkeeper-expedition" &&
      instanceId &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0 &&
      value.revision <= 2_147_483_647 &&
      ALLOWED_EXPEDITION_STATUSES.has(value.status) &&
      (ALLOWED_EXPEDITION_STAGES.has(value.stageId) ||
        (value.status === "expired" && value.stageId === null)) &&
      Number.isInteger(value.memberCount) &&
      value.memberCount >= 0 &&
      value.memberCount <= 4 &&
      value.maxMembers === 4 &&
      expiresAt !== undefined &&
      echoAvailableAt !== undefined &&
      Number.isSafeInteger(serverNow) &&
      serverNow >= 0 &&
      (value.resultMode === null ||
        ALLOWED_EXPEDITION_RESULTS.has(value.resultMode)) &&
      typeof value.personal?.joined === "boolean" &&
      typeof value.personal?.canUseEcho === "boolean" &&
      personalTargetsArePublic &&
      personalAvailabilityIsCoherent &&
      ((value.personal.joined &&
        (value.status === "forming" || value.status === "active")) ||
        personalAvailableTargetIds.length === 0) &&
      coherentLifecycle &&
      coherentTargets &&
      (!value.personal.canUseEcho ||
        (value.personal.joined &&
          value.status === "active" &&
          echoAvailableAt !== null &&
          echoAvailableAt <= serverNow)),
  );
  if (!valid) return idleExpeditionState(serverNow);
  return {
    id: "lanternkeeper-expedition",
    instanceId,
    revision: value.revision,
    status: value.status,
    stageId: value.stageId,
    memberCount: value.memberCount,
    maxMembers: 4,
    expiresAt,
    echoAvailableAt,
    resultMode: value.resultMode,
    completedTargetIds,
    personal: {
      joined: value.personal.joined,
      completedTargetIds: personalCompletedTargetIds,
      availableTargetIds: personalAvailableTargetIds,
      canUseEcho: value.personal.canUseEcho,
    },
    serverNow,
  };
}

function expeditionTarget(value) {
  if (!value || typeof value !== "object") return null;
  if (value.instanceId === null && value.targetId === null) {
    return { instanceId: null, targetId: null };
  }
  if (
    typeof value.instanceId !== "string" ||
    !SAFE_PUBLIC_EVENT_INSTANCE_ID.test(value.instanceId) ||
    !ALLOWED_EXPEDITION_TARGETS.has(value.targetId)
  ) {
    return null;
  }
  return { instanceId: value.instanceId, targetId: value.targetId };
}

function isWorldMessage(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.scope === WORLD_SCOPE &&
    value.version === WORLD_PROTOCOL_VERSION &&
    typeof value.type === "string",
  );
}

export default function GameClientFrame({
  controller,
  profile,
  remotePlayers,
  activityState,
  journeyState,
  questState,
  publicEventState,
  expeditionState,
  audioEnabled,
  paused,
  onNearbyChange,
  onPlayerSnapshot,
  onPerformanceSample,
  onActionRequest,
  onExpeditionTargetChange,
  onRemotePlayerClick,
  onAudioStateChange,
  onFailure,
}) {
  const frameRef = useRef(null);
  const failureReportedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const gameUrl = process.env.REACT_APP_GAME_CLIENT_URL || "/game/index.html";
  const gameOrigin = useMemo(
    () => new URL(gameUrl, window.location.href).origin,
    [gameUrl],
  );
  const bridgeProfile = useMemo(() => publicProfile(profile), [profile]);
  const bridgeRemotePlayers = useMemo(
    () => publicRemotePlayers(remotePlayers),
    [remotePlayers],
  );
  const bridgeActivityState = useMemo(
    () => publicActivityState(activityState),
    [activityState],
  );
  const bridgeJourneyState = useMemo(
    () => publicJourneyState(journeyState),
    [journeyState],
  );
  const bridgeQuestState = useMemo(
    () => publicQuestState(questState),
    [questState],
  );
  const bridgePublicEventState = useMemo(
    () => publicWorldEventState(publicEventState),
    [publicEventState],
  );
  const bridgeExpeditionState = useMemo(
    () => publicExpeditionState(expeditionState),
    [expeditionState],
  );
  const bridgeStateRef = useRef({});
  bridgeStateRef.current = {
    audioEnabled,
    bridgeActivityState,
    bridgeJourneyState,
    bridgeProfile,
    bridgePublicEventState,
    bridgeExpeditionState,
    bridgeQuestState,
    bridgeRemotePlayers,
    controller,
    onActionRequest,
    onExpeditionTargetChange,
    onNearbyChange,
    onPerformanceSample,
    onPlayerSnapshot,
    onRemotePlayerClick,
    paused,
    onAudioStateChange,
    onFailure,
  };

  const reportFailure = useCallback((reason) => {
    if (failureReportedRef.current) return;
    failureReportedRef.current = true;
    bridgeStateRef.current.onFailure?.(reason);
  }, []);

  const send = useCallback(
    (type, payload) => {
      const target = frameRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(
        { scope: WORLD_SCOPE, version: WORLD_PROTOCOL_VERSION, type, payload },
        gameOrigin,
      );
    },
    [gameOrigin],
  );

  useEffect(() => {
    const onMessage = (event) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        event.origin !== gameOrigin
      )
        return;
      if (!isWorldMessage(event.data)) return;

      const { type, payload } = event.data;
      const state = bridgeStateRef.current;
      if (type === "READY") {
        setReady(true);
        send("BOOT", {
          room: "afterlight-market-garden-v1",
          player: state.bridgeProfile,
          remotePlayers: state.bridgeRemotePlayers,
        });
        send("AVATAR_UPDATED", {
          color: state.bridgeProfile.color,
          appearance: state.bridgeProfile.appearance,
        });
        send("ACTIVITY_STATE", state.bridgeActivityState);
        if (state.bridgeJourneyState) {
          send("JOURNEY_STATE", state.bridgeJourneyState);
        }
        send("QUEST_STATE", state.bridgeQuestState);
        send("PUBLIC_EVENT_STATE", state.bridgePublicEventState);
        send("EXPEDITION_STATE", state.bridgeExpeditionState);
        send("AUDIO_SETTINGS", { enabled: state.audioEnabled !== false });
        send(state.paused ? "PAUSE" : "RESUME");
        send(
          "INPUT_AXIS",
          state.paused
            ? { x: 0, z: 0 }
            : state.controller?.getAxis?.() || { x: 0, z: 0 },
        );
      } else if (type === "LOCAL_SNAPSHOT") {
        if (
          [payload?.x, payload?.z, payload?.heading, payload?.speed].every(
            Number.isFinite,
          )
        ) {
          state.onPlayerSnapshot?.({
            x: clamp(payload.x, -60, 60),
            z: clamp(payload.z, -60, 60),
            heading: clamp(payload.heading, -Math.PI * 2, Math.PI * 2),
            speed: clamp(payload.speed, 0, 12),
          });
        }
      } else if (type === "LANDMARK_ENTERED") {
        state.onNearbyChange?.(
          ALLOWED_LANDMARKS.has(payload?.id) ? payload.id : null,
        );
      } else if (type === "PERFORMANCE_SAMPLE") {
        if (
          Number.isFinite(payload?.fps) &&
          Number.isFinite(payload?.remotePlayers)
        ) {
          state.onPerformanceSample?.({
            fps: clamp(payload.fps, 0, 240),
            remotePlayers: clamp(payload.remotePlayers, 0, 64),
          });
        }
      } else if (type === "ACTION_REQUESTED") {
        if (ALLOWED_ACTIONS.has(payload?.action)) {
          state.onActionRequest?.(payload.action);
        } else if (
          payload?.action === "expedition-contribute" &&
          payload?.target?.kind === "expedition"
        ) {
          const target = expeditionTarget(payload.target);
          if (target?.instanceId) {
            state.onActionRequest?.({
              action: "expedition-contribute",
              target: { kind: "expedition", ...target },
            });
          }
        }
      } else if (type === "EXPEDITION_TARGET_CHANGED") {
        const target = expeditionTarget(payload);
        if (target) state.onExpeditionTargetChange?.(target);
      } else if (type === "REMOTE_PLAYER_SELECTED") {
        const selected = state.bridgeRemotePlayers.find(
          (player) => player.uid === payload?.uid,
        );
        if (selected) state.onRemotePlayerClick?.(selected.uid, selected);
      } else if (type === "AUDIO_STATE") {
        if (ALLOWED_AUDIO_STATES.has(payload?.state)) {
          state.onAudioStateChange?.(payload.state);
        }
      } else if (type === "FATAL_ERROR") {
        reportFailure("renderer");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [gameOrigin, reportFailure, send]);

  useEffect(() => {
    if (ready) return undefined;
    const timer = window.setTimeout(
      () => reportFailure("timeout"),
      WORLD_READY_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ready, reportFailure]);

  useEffect(() => {
    if (!ready) return;
    send("REMOTE_SNAPSHOTS", { players: bridgeRemotePlayers });
  }, [bridgeRemotePlayers, ready, send]);

  useEffect(() => {
    if (!ready) return;
    send("AVATAR_UPDATED", {
      color: bridgeProfile.color,
      appearance: bridgeProfile.appearance,
    });
  }, [bridgeProfile, ready, send]);

  useEffect(() => {
    if (!ready) return;
    if (paused) send("INPUT_AXIS", { x: 0, z: 0 });
    send(paused ? "PAUSE" : "RESUME");
  }, [paused, ready, send]);

  useEffect(() => {
    if (!ready) return;
    send("ACTIVITY_STATE", bridgeActivityState);
  }, [bridgeActivityState, ready, send]);

  useEffect(() => {
    if (!ready || !bridgeJourneyState) return;
    send("JOURNEY_STATE", bridgeJourneyState);
  }, [bridgeJourneyState, ready, send]);

  useEffect(() => {
    if (!ready) return;
    send("QUEST_STATE", bridgeQuestState);
  }, [bridgeQuestState, ready, send]);

  useEffect(() => {
    if (!ready) return;
    send("PUBLIC_EVENT_STATE", bridgePublicEventState);
  }, [bridgePublicEventState, ready, send]);

  useEffect(() => {
    if (!ready) return;
    send("EXPEDITION_STATE", bridgeExpeditionState);
  }, [bridgeExpeditionState, ready, send]);

  useEffect(() => {
    if (!ready) return;
    send("AUDIO_SETTINGS", { enabled: audioEnabled !== false });
  }, [audioEnabled, ready, send]);

  useEffect(() => {
    if (!controller || !ready) return undefined;
    const publishAxis = () => send("INPUT_AXIS", controller.getAxis());
    publishAxis();
    return controller.subscribe(publishAxis);
  }, [controller, ready, send]);

  return (
    <div className="world-game-client">
      <iframe
        ref={frameRef}
        className="world-game-client__frame"
        src={gameUrl}
        title="Afterlight game world"
        allow="autoplay; fullscreen"
        onError={() => reportFailure("load")}
      />
      {!ready && (
        <div className="world-game-client__loading">
          Opening the next Afterlight world…
        </div>
      )}
    </div>
  );
}
