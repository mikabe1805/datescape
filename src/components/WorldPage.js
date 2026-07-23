import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Hand,
  Link2,
  MessageCircle,
  Moon,
  Smile,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import HubWorldScene from "../game/HubWorldScene";
import {
  useMovementController,
  useKeyboardBindings,
} from "../game/useMovement";
import { DISTRICT, LANDMARKS, NPCS } from "../game/worldData";
import { usePresence } from "../game/usePresence";
import {
  loadWorldSoundPreference,
  saveWorldSoundPreference,
} from "../game/worldSoundPreference";
import {
  useStation,
  useMatchMoves,
  useSignals,
  sendSignal,
} from "../game/useStation";
import { subscribeToWorldConnections } from "../game/worldConnections";
import Joystick from "./world/Joystick";
import ChessGame from "./world/ChessGame";
import ProfileCard from "./world/ProfileCard";
import StationLobby from "./world/StationLobby";
import SocialMoment from "./world/SocialMoment";
import ResonanceDuet from "./world/ResonanceDuet";
import EmoteWheel from "./world/EmoteWheel";
import ChatInput from "./world/ChatInput";
import GameClientFrame from "./world/GameClientFrame";
import NightJourneyCard from "./world/NightJourneyCard";
import SharedMomentAfterglow from "./world/SharedMomentAfterglow";
import QuestTracker from "./world/QuestTracker";
import AvatarStudio from "./world/AvatarStudio";
import RainlightRelayCard from "./world/RainlightRelayCard";
import LanternkeeperExpeditionCard from "./world/LanternkeeperExpeditionCard";
import WorldActivityDock from "./world/WorldActivityDock";
import {
  advanceNightJourney,
  createNightJourney,
  hydrateNightJourney,
  hydrateNightKeepsakes,
  nightJourneyBridgeState,
  nightJourneyProgress,
} from "../game/nightJourney";
import {
  appendSharedMomentReceipt,
  hydrateSharedMomentReceipts,
  sharedMomentReceiptId,
} from "../game/sharedMomentReceipts";
import { socialMomentOutcome } from "../game/socialMoment";
import {
  hydrateAvatarAppearance,
  publicAvatarAppearance,
  accessoryIsUnlocked,
  trimIsUnlocked,
} from "../game/avatarAppearance";
import {
  WORLD_EVENT_TYPES,
  applyWorldProgressionEvent,
  createWorldProgression,
  hydrateWorldProgression,
  progressionEventFromSharedReceipt,
  selectActiveQuests,
  selectAvailableQuests,
  selectLevelProgress,
  selectQuestProgress,
} from "../game/worldProgression";
import {
  loadWorldProgression,
  recordWorldProgressionEvent,
} from "../game/worldProgressionBridge";
import {
  avatarAuthorityIsReady,
  expeditionReceiptSyncDisposition,
  lanternkeeperCompletionCopy,
  mutationWasConfirmed,
  questActionIsConfirmed,
  resonanceEchoIsEligible,
  selectVisibleWorldCohort,
  sharedEncounterForAfterglow,
} from "../game/worldPageAuthority";
import { useRainlightRelay } from "../game/useRainlightRelay";
import { useLanternkeeperExpedition } from "../game/useLanternkeeperExpedition";
import { useSharedEncounters } from "../game/useSharedEncounters";
import { useResonanceEcho } from "../game/useResonanceEcho";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { blockUser, reportUser } from "../utils/MatchActions";
import "../css/world.css";

const COLOR_OPTIONS = ["#f5c973", "#8ad6c6", "#f19bb8", "#99b4ff", "#d9b0ff"];
const STORAGE_PREFIX = "datescape:world:v6:";
const FEED_LIMIT = 18;
const ROOM_ID = "afterlight-market-garden-v1";
const WORLD_ROUTE_NAME = "Afterlight Shore";
const LANTERNKEEPER_QUEST_ID = "afterlight-lanternkeeper-expedition";
const WORLD_DIALOG_FOCUSABLE =
  "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
const QUEST_OBJECTIVE_LANDMARKS = Object.freeze({
  "reach-conservatory": "conservatory",
  "recover-rain-prism": "conservatory",
  "resonate-together": "resonance",
  "return-to-market": "market",
  "taste-the-mystery-note": "market",
  "listen-together": "market",
  "wake-rainlight": "resonance",
  "complete-expedition": "resonance",
});

const SESSION_INTENTS = [
  {
    id: "meet",
    eyebrow: "Open to meeting",
    title: "Meet someone new",
    description: "Approaches are welcome. You still choose every interaction.",
    icon: Sparkles,
  },
  {
    id: "friends",
    eyebrow: "Social",
    title: "Hang out",
    description: "Join a game, an event, or an easy group conversation.",
    icon: UsersRound,
  },
  {
    id: "match",
    eyebrow: "Together",
    title: "Meet a connection",
    description: "Make space for someone you already matched with.",
    icon: Link2,
  },
  {
    id: "solo",
    eyebrow: "Quiet mode",
    title: "Explore solo",
    description: "Take in the district without new approaches tonight.",
    icon: Moon,
  },
];

function storageKeyFor(uid) {
  return uid ? `${STORAGE_PREFIX}${uid}` : `${STORAGE_PREFIX}anon`;
}

function loadState(uid) {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(uid));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(uid, state) {
  try {
    window.localStorage.setItem(storageKeyFor(uid), JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function sessionIntentKey(uid) {
  return `datescape:afterlight:intent:${uid || "anon"}`;
}

function privateActivityStation(activity, uidA, uidB) {
  return `${activity}--${[uidA, uidB].sort().join("_")}`;
}

function stationContextFor(stationId) {
  const stationType = stationId?.split("--")[0] || null;
  if (!stationType) {
    return { stationType: null, landmark: null, activity: null };
  }
  const landmark =
    LANDMARKS.find((candidate) =>
      candidate.activities?.some(
        (activity) => activity.stationId === stationType,
      ),
    ) || null;
  const activity =
    landmark?.activities?.find(
      (candidate) => candidate.stationId === stationType,
    ) || null;
  return { stationType, landmark, activity };
}

function socialOpponentFor(match, myUid, remotePlayers) {
  if (!match || !myUid) return null;
  const opponentUid = match.white === myUid ? match.black : match.white;
  if (!opponentUid) return null;
  const opponentName =
    match.white === myUid ? match.blackName : match.whiteName;
  const opponentColor =
    match.white === myUid ? match.blackColor : match.whiteColor;
  const livePlayer = remotePlayers.find(
    (player) => player.uid === opponentUid,
  );
  return {
    uid: opponentUid,
    name: livePlayer?.name || opponentName || "another person",
    color: livePlayer?.color || opponentColor || "#c7a4ff",
    intent: livePlayer?.intent || "meet",
  };
}

function loadSessionIntent(uid) {
  try {
    const value = window.sessionStorage.getItem(sessionIntentKey(uid));
    return SESSION_INTENTS.some((intent) => intent.id === value) ? value : null;
  } catch {
    return null;
  }
}

function saveSessionIntent(uid, value) {
  try {
    if (value) window.sessionStorage.setItem(sessionIntentKey(uid), value);
    else window.sessionStorage.removeItem(sessionIntentKey(uid));
  } catch {
    /* private browsing quota */
  }
}

function useIsTouch() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return isTouch;
}

function defaultName() {
  const u = auth.currentUser;
  return (u?.displayName || "Wayfarer").slice(0, 22);
}

function makeFeedEntry(text, tone = "info") {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    tone,
    at: Date.now(),
  };
}

export default function WorldPage({ preview = false }) {
  const navigate = useNavigate();
  const useNextWorld = useMemo(() => {
    const requestedEngine = new URLSearchParams(window.location.search).get(
      "worldEngine",
    );
    if (requestedEngine === "legacy") return false;
    if (requestedEngine === "playcanvas") return true;
    return process.env.REACT_APP_WORLD_ENGINE !== "legacy";
  }, []);
  const [nextWorldFailed, setNextWorldFailed] = useState(false);
  // World state is keyed per-user uid. When auth.currentUser changes (logout
  // then login), we re-hydrate from that user's saved slice — otherwise you'd
  // see the previous account's avatar and progress.
  const [authUid, setAuthUid] = useState(() => auth.currentUser?.uid || null);
  useEffect(() => {
    const id = setInterval(() => {
      const next = auth.currentUser?.uid || null;
      setAuthUid((current) => (current === next ? current : next));
    }, 800);
    return () => clearInterval(id);
  }, []);

  const initial = useMemo(() => loadState(authUid), [authUid]);
  const initialIntent = useMemo(() => loadSessionIntent(authUid), [authUid]);
  const [avatarColor, setAvatarColor] = useState(
    initial?.avatarColor || COLOR_OPTIONS[0],
  );
  const [avatarAppearance, setAvatarAppearance] = useState(() =>
    hydrateAvatarAppearance(initial?.avatarAppearance),
  );
  const [playerName, setPlayerName] = useState(
    () => initial?.playerName || defaultName(),
  );
  const [feed, setFeed] = useState(
    () =>
      initial?.feed || [
        makeFeedEntry(`${WORLD_ROUTE_NAME} is open for the evening.`, "system"),
      ],
  );
  const [memories, setMemories] = useState(() => initial?.memories || {});
  const [chessRecord, setChessRecord] = useState(
    () => initial?.chessRecord || { wins: 0, losses: 0, draws: 0 },
  );
  const [worldLikes, setWorldLikes] = useState(() => initial?.worldLikes || {});
  const [worldProgression, setWorldProgression] = useState(() =>
    hydrateWorldProgression(initial?.worldProgression),
  );
  const [profileHydratedUid, setProfileHydratedUid] = useState(null);
  const [progressionHydratedUid, setProgressionHydratedUid] = useState(null);
  const avatarAuthorityReady = avatarAuthorityIsReady({
    authUid,
    profileHydratedUid,
    progressionHydratedUid,
  });
  const progressionEventCounterRef = useRef(0);
  const progressionDirtyRef = useRef(false);
  const progressionSyncSequenceRef = useRef(0);
  const progressionSyncQueueRef = useRef(Promise.resolve());
  const rainlightCompletionSyncRef = useRef(null);
  const expeditionCompletionSyncRef = useRef(null);
  const nearbyExpeditionInstanceRef = useRef(null);
  const [sessionIntent, setSessionIntent] = useState(initialIntent);
  const [arrivalChoice, setArrivalChoice] = useState(initialIntent || "meet");
  const [showArrival, setShowArrival] = useState(!initialIntent);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [mutedUsers, setMutedUsers] = useState([]);
  const [mutualMatches, setMutualMatches] = useState({});
  const [nightJourney, setNightJourney] = useState(() =>
    hydrateNightJourney(initial?.nightJourney),
  );
  const [nightKeepsakes, setNightKeepsakes] = useState(() =>
    hydrateNightKeepsakes(initial?.nightKeepsakes),
  );
  const [sharedMomentReceipts, setSharedMomentReceipts] = useState(() =>
    hydrateSharedMomentReceipts(initial?.sharedMomentReceipts),
  );
  const sharedReceiptIdsRef = useRef(
    new Set(
      hydrateSharedMomentReceipts(initial?.sharedMomentReceipts).map(
        (receipt) => receipt.id,
      ),
    ),
  );
  const [sharedAfterglow, setSharedAfterglow] = useState(null);
  const [socialRoundHandoff, setSocialRoundHandoffValue] = useState(null);
  const socialRoundHandoffRef = useRef(null);
  const setSocialRoundHandoff = useCallback((next) => {
    const current = socialRoundHandoffRef.current;
    const resolved = typeof next === "function" ? next(current) : next;
    socialRoundHandoffRef.current = resolved;
    setSocialRoundHandoffValue(resolved);
  }, []);
  const [socialReplayRequest, setSocialReplayRequest] = useState(null);
  const socialReplayRunningRef = useRef(false);
  const departedSocialMatchesRef = useRef(new Set());
  const celebratedJourneyRef = useRef(
    nightJourney.completedAt ? nightJourney.id : null,
  );

  // When the logged-in user changes, reload the world state from their slice.
  const lastHydratedUidRef = useRef(authUid);
  useEffect(() => {
    if (lastHydratedUidRef.current === authUid) return;
    lastHydratedUidRef.current = authUid;
    setProfileHydratedUid(null);
    setProgressionHydratedUid(null);
    const slice = loadState(authUid);
    setAvatarColor(slice?.avatarColor || COLOR_OPTIONS[0]);
    setAvatarAppearance(hydrateAvatarAppearance(slice?.avatarAppearance));
    setPlayerName(slice?.playerName || defaultName());
    setFeed(
      slice?.feed || [
        makeFeedEntry(`${WORLD_ROUTE_NAME} is open for the evening.`, "system"),
      ],
    );
    setMemories(slice?.memories || {});
    setChessRecord(slice?.chessRecord || { wins: 0, losses: 0, draws: 0 });
    setWorldLikes(slice?.worldLikes || {});
    setWorldProgression(
      hydrateWorldProgression(
        slice?.worldProgression || createWorldProgression(),
      ),
    );
    progressionDirtyRef.current = false;
    progressionSyncSequenceRef.current += 1;
    progressionSyncQueueRef.current = Promise.resolve();
    const nextJourney = hydrateNightJourney(slice?.nightJourney);
    setNightJourney(nextJourney);
    setNightKeepsakes(hydrateNightKeepsakes(slice?.nightKeepsakes));
    const nextSharedReceipts = hydrateSharedMomentReceipts(
      slice?.sharedMomentReceipts,
    );
    setSharedMomentReceipts(nextSharedReceipts);
    sharedReceiptIdsRef.current = new Set(
      nextSharedReceipts.map((receipt) => receipt.id),
    );
    celebratedJourneyRef.current = nextJourney.completedAt
      ? nextJourney.id
      : null;
    const nextIntent = loadSessionIntent(authUid);
    setSessionIntent(nextIntent);
    setArrivalChoice(nextIntent || "meet");
    setShowArrival(!nextIntent);
    setSharedAfterglow(null);
    setSocialRoundHandoff(null);
    setSocialReplayRequest(null);
    setProfileTarget(null);
    setAvatarStudioOpen(false);
    setActiveMatchInfo(null);
    setActiveStationId(null);
    setActiveLandmarkId(null);
    nearbyExpeditionInstanceRef.current = null;
    setNearbyExpeditionTarget(null);
    setNpcChessActive(false);
    setPaused(false);
    socialReplayRunningRef.current = false;
    departedSocialMatchesRef.current = new Set();
    rainlightCompletionSyncRef.current = null;
    expeditionCompletionSyncRef.current = null;
  }, [authUid, setSocialRoundHandoff]);

  // Firestore is the source of truth for identity and blocks. Never derive a
  // public world name from an email address.
  useEffect(() => {
    if (!authUid) return undefined;
    let cancelled = false;
    getDoc(doc(db, "users", authUid))
      .then((snapshot) => {
        if (cancelled) return;
        setProfileHydratedUid(authUid);
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const safeName = data.displayName || data.username;
        if (safeName) setPlayerName(String(safeName).slice(0, 22));
        if (COLOR_OPTIONS.includes(data.worldProfile?.color)) {
          setAvatarColor(data.worldProfile.color);
        }
        if (data.worldProfile?.appearance) {
          setAvatarAppearance(
            hydrateAvatarAppearance(data.worldProfile.appearance),
          );
        }
        setBlockedUsers(
          Array.isArray(data.blockedUsers) ? data.blockedUsers : [],
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authUid]);

  // Existing mutuals should be recognizable the moment their avatar is
  // opened, not only after a new in-world Spark arrives during this visit.
  // Keep the live roster bounded; the full history is paginated elsewhere.
  useEffect(() => {
    setMutualMatches({});
    if (!authUid) return undefined;
    return subscribeToWorldConnections({
      db,
      uid: authUid,
      onConnections: setMutualMatches,
      onError: (error) => {
        console.warn("[WorldPage] connection roster unavailable:", error.message);
      },
    });
  }, [authUid]);

  // Authenticated progression is server-owned. Local state remains an
  // optimistic/offline cache so preview play and brief disconnects still feel
  // responsive; successful callable responses always reconcile it.
  useEffect(() => {
    if (!authUid) return undefined;
    let cancelled = false;
    loadWorldProgression().then(({ progression }) => {
      if (cancelled || !progression || progressionDirtyRef.current) return;
      setWorldProgression(hydrateWorldProgression(progression));
      setProgressionHydratedUid(authUid);
    });
    return () => {
      cancelled = true;
    };
  }, [authUid]);

  const [nearbyId, setNearbyId] = useState(null);
  const [nearbyExpeditionTarget, setNearbyExpeditionTarget] = useState(null);
  const [activeLandmarkId, setActiveLandmarkId] = useState(null);
  const [paused, setPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(loadWorldSoundPreference);
  const [worldAudioState, setWorldAudioState] = useState(() =>
    loadWorldSoundPreference() ? "locked" : "muted",
  );

  const toggleWorldSound = useCallback(() => {
    const nextEnabled = !soundEnabled;
    setSoundEnabled(nextEnabled);
    setWorldAudioState(nextEnabled ? "locked" : "muted");
    saveWorldSoundPreference(nextEnabled);
  }, [soundEnabled]);
  const navigateToLogin = useCallback(() => navigate("/login"), [navigate]);

  // Stations / lobby state
  const [activeStationId, setActiveStationId] = useState(null);
  const activeStationIdRef = useRef(activeStationId);
  activeStationIdRef.current = activeStationId;
  const [activeMatchInfo, setActiveMatchInfo] = useState(null); // when game in progress
  const [npcChessActive, setNpcChessActive] = useState(false);

  // Profile card for tapped remote player
  const [profileTarget, setProfileTarget] = useState(null); // { uid, name, color }
  const [avatarStudioOpen, setAvatarStudioOpen] = useState(false);

  const [, setSnapshotTick] = useState(0);
  const playerStateRef = useRef({ x: 0, z: 6, heading: 0, speed: 0 });
  const snapshotRef = useRef(playerStateRef.current);
  const extrasRef = useRef({});
  const worldModalPanelRef = useRef(null);
  const modalRestoreFocusRef = useRef(null);
  const lastWorldFocusRef = useRef(null);

  const [emoteOpen, setEmoteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const controller = useMovementController();
  const isTouch = useIsTouch();
  useKeyboardBindings(controller, { enabled: !paused });

  const profile = useMemo(
    () => ({
      name: playerName,
      color: avatarColor,
      intent: sessionIntent || "solo",
      appearance: publicAvatarAppearance(avatarAppearance),
    }),
    [playerName, avatarColor, sessionIntent, avatarAppearance],
  );

  // Multiplayer presence
  const { remotePlayers, myUid } = usePresence({
    snapshotRef,
    extrasRef,
    profile,
    enabled: Boolean(sessionIntent && authUid),
    currentRoom: ROOM_ID,
  });

  const visibleRemotePlayers = selectVisibleWorldCohort(
    remotePlayers,
    snapshotRef.current,
    {
      blockedUids: blockedUsers,
      mutedUids: mutedUsers,
    },
  );

  const rainlightRelay = useRainlightRelay({
    enabled: Boolean(authUid),
    sessionKey: authUid,
  });
  const lanternkeeperExpedition = useLanternkeeperExpedition({
    enabled: Boolean(authUid),
    sessionKey: authUid,
  });
  const sharedEncounters = useSharedEncounters({
    enabled: Boolean(authUid),
    sessionKey: authUid,
  });
  const refreshSharedEncounters = sharedEncounters.refresh;
  const sendSharedEncounterSpark = sharedEncounters.sendSpark;
  const passSharedEncounter = sharedEncounters.pass;
  const resonanceEcho = useResonanceEcho({
    enabled: Boolean(authUid),
    sessionKey: authUid,
  });
  const startResonanceEchoWait = resonanceEcho.start;
  const completeResonanceEchoWait = resonanceEcho.complete;
  const clearResonanceEcho = resonanceEcho.clear;
  const verifiedAfterglowEncounter = useMemo(
    () =>
      sharedEncounterForAfterglow(
        sharedEncounters.encounters,
        sharedAfterglow,
      ),
    [sharedAfterglow, sharedEncounters.encounters],
  );
  const startLanternkeeper = lanternkeeperExpedition.start;
  const joinLanternkeeper = lanternkeeperExpedition.join;
  const leaveLanternkeeper = lanternkeeperExpedition.leave;
  const contributeLanternkeeper = lanternkeeperExpedition.contribute;
  const contributeRainlight = rainlightRelay.contribute;
  // Another traveler can complete the shared Relay after our own light is
  // banked. Reconcile the server-owned quest as soon as that aggregate world
  // state resolves so the objective advances without a reload.
  useEffect(() => {
    const instanceId = rainlightRelay.event.instanceId;
    if (
      !authUid ||
      (rainlightRelay.event.phase !== "completed" &&
        rainlightRelay.event.phase !== "cooldown") ||
      !instanceId ||
      rainlightCompletionSyncRef.current === instanceId
    ) {
      return;
    }
    rainlightCompletionSyncRef.current = instanceId;
    loadWorldProgression().then(({ progression }) => {
      if (progression) {
        progressionDirtyRef.current = false;
        setWorldProgression(hydrateWorldProgression(progression));
        setProgressionHydratedUid(authUid);
      }
    });
  }, [authUid, rainlightRelay.event.instanceId, rainlightRelay.event.phase]);

  // Expedition completion may be caused by a party member's complementary
  // chime. The trusted server receipt advances the quest; reconcile it from
  // the private progression document without turning party activity into XP.
  useEffect(() => {
    const instanceId = lanternkeeperExpedition.expedition.instanceId;
    if (
      !authUid ||
      lanternkeeperExpedition.expedition.phase !== "completed" ||
      !instanceId ||
      expeditionCompletionSyncRef.current === instanceId ||
      expeditionCompletionSyncRef.current === `complete:${instanceId}` ||
      expeditionCompletionSyncRef.current === `settled:${instanceId}`
    ) {
      return undefined;
    }
    expeditionCompletionSyncRef.current = instanceId;
    let cancelled = false;
    let retryTimer = null;
    const sync = () => {
      loadWorldProgression()
        .then(({ progression }) => {
          if (cancelled) return;
          if (progression) {
            progressionDirtyRef.current = false;
            setWorldProgression(hydrateWorldProgression(progression));
            setProgressionHydratedUid(authUid);
            const quest = selectQuestProgress(
              progression,
              LANTERNKEEPER_QUEST_ID,
            );
            const disposition = expeditionReceiptSyncDisposition(
              quest?.status,
            );
            if (disposition === "confirmed") {
              expeditionCompletionSyncRef.current = `complete:${instanceId}`;
              return;
            }
            if (disposition === "settled") {
              expeditionCompletionSyncRef.current = `settled:${instanceId}`;
              return;
            }
          }
          retryTimer = window.setTimeout(sync, 4_000);
        })
        .catch(() => {
          if (!cancelled) retryTimer = window.setTimeout(sync, 4_000);
        });
    };
    sync();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (expeditionCompletionSyncRef.current === instanceId) {
        expeditionCompletionSyncRef.current = null;
      }
    };
  }, [
    authUid,
    lanternkeeperExpedition.expedition.instanceId,
    lanternkeeperExpedition.expedition.phase,
  ]);

  // Equipped public catalog IDs follow the user across devices. Inventory and
  // progression never travel through presence or the renderer bridge.
  useEffect(() => {
    if (!authUid || !avatarAuthorityReady) return;
    setDoc(
      doc(db, "users", authUid),
      {
        worldProfile: {
          color: avatarColor,
          appearance: publicAvatarAppearance(avatarAppearance),
          lastSeen: Date.now(),
        },
      },
      { merge: true },
    ).catch(() => {});
  }, [
    authUid,
    avatarAppearance,
    avatarAuthorityReady,
    avatarColor,
  ]);

  // Station hook (only active when sitting)
  const stationContext = useMemo(
    () => stationContextFor(activeStationId),
    [activeStationId],
  );
  const stationMode =
    stationContext.activity?.kind === "cooperative"
      ? "resonance"
      : stationContext.activity?.kind === "social"
        ? "social"
        : "chess";
  const station = useStation({
    stationId: activeStationId,
    room: ROOM_ID,
    profile,
    enabled: Boolean(activeStationId),
    mode: stationMode,
    excludedUids: blockedUsers,
  });
  const {
    sit: sitAtStation,
    stand: standAtStation,
    submitResonance,
    submitSocialChoice,
    acknowledgeCompletion,
  } = station;

  // Subscribe to chess match moves only while a match is active
  const matchPath =
    activeStationId && station.match?.id
      ? `stations/${ROOM_ID}/${activeStationId}/match`
      : null;
  const matchMoves = useMatchMoves(
    matchPath,
    stationMode === "chess" && Boolean(matchPath),
  );

  // Incoming signals (waves and invitations)
  const { signals, consume: consumeSignal } = useSignals({
    enabled: Boolean(sessionIntent && sessionIntent !== "solo"),
  });
  const [pendingWaveSignal, setPendingWaveSignal] = useState(null);
  const [pendingInviteSignal, setPendingInviteSignal] = useState(null);

  useEffect(() => {
    if (!signals.length) return;
    const next = signals[signals.length - 1];
    if (!next) return;
    if (next.type === "wave") {
      setPendingWaveSignal(next);
      appendFeedRef.current?.(
        `${next.fromName || "Someone"} waves at you.`,
        "discovery",
      );
    } else if (next.type === "invite-chess") {
      if (pendingInviteSignal?.actionId !== next.actionId) {
        setPendingInviteSignal(next);
        appendFeedRef.current?.(
          `${next.fromName || "Someone"} invited you to a quick game.`,
          "discovery",
        );
      }
      return;
    } else if (next.type === "invite-chess-accepted") {
      appendFeedRef.current?.(
        `${next.fromName || "Someone"} accepted your invitation.`,
        "discovery",
      );
    } else if (next.type === "invite-chess-declined") {
      appendFeedRef.current?.(
        `${next.fromName || "Someone"} isn't joining this round.`,
        "system",
      );
    }
    consumeSignal(next.key);
  }, [signals, consumeSignal, pendingInviteSignal]);

  const appendFeedRef = useRef(null);
  const appendFeed = useCallback((text, tone = "info") => {
    setFeed((prev) => [
      ...prev.slice(-(FEED_LIMIT - 1)),
      makeFeedEntry(text, tone),
    ]);
  }, []);
  appendFeedRef.current = appendFeed;

  const recordProgressionEvent = useCallback(
    (event) => {
      if (!event?.type) return Promise.resolve({ ignored: true });
      const occurredAt = event.occurredAt || Date.now();
      const id =
        event.id ||
        `${event.type}:${occurredAt}:${progressionEventCounterRef.current++}`;
      const completeEvent = { ...event, id, occurredAt };
      progressionDirtyRef.current = true;
      setWorldProgression((current) =>
        applyWorldProgressionEvent(current, completeEvent),
      );
      if (!authUid) {
        return Promise.resolve({
          ignored: false,
          offline: true,
          progression: null,
        });
      }
      const sequence = progressionSyncSequenceRef.current + 1;
      progressionSyncSequenceRef.current = sequence;
      progressionSyncQueueRef.current = progressionSyncQueueRef.current
        .catch(() => null)
        .then(() => recordWorldProgressionEvent(completeEvent))
        .then(async (result) => {
          let progression = result?.progression || null;
          // Resonance receipts are deliberately rejected by the client event
          // callable and applied by the RTDB verification trigger instead.
          // Give that trusted write a brief head start before reconciling, or
          // an immediate read can replace the just-finished objective with the
          // older server snapshot.
          if (
            !progression &&
            result?.ignored &&
            completeEvent.type === WORLD_EVENT_TYPES.COOPERATION_RECEIPT &&
            sequence === progressionSyncSequenceRef.current
          ) {
            await new Promise((resolve) => window.setTimeout(resolve, 3_000));
          }
          if (!progression && sequence === progressionSyncSequenceRef.current) {
            const loaded = await loadWorldProgression();
            progression = loaded.progression || null;
          }
          if (progression && sequence === progressionSyncSequenceRef.current) {
            progressionDirtyRef.current = false;
            setWorldProgression(hydrateWorldProgression(progression));
            setProgressionHydratedUid(authUid);
          }
          return {
            ...result,
            progression,
            reconciledAfterTransportError: Boolean(result?.error && progression),
          };
        });
      return progressionSyncQueueRef.current;
    },
    [authUid],
  );

  const handleRainlightContribute = useCallback(
    async (sourceId) => {
      if (!authUid) {
        navigate("/login");
        return;
      }
      // Quest activities are serialized through the progression callable.
      // Wait for a just-touched Wake beacon before asking the Relay callable
      // to issue trusted source/completion receipts.
      await progressionSyncQueueRef.current.catch(() => null);
      const result = await contributeRainlight(sourceId);
      if (result.progression) {
        progressionDirtyRef.current = false;
        progressionSyncSequenceRef.current += 1;
        setWorldProgression(hydrateWorldProgression(result.progression));
        setProgressionHydratedUid(authUid);
      }
      if (result.error) {
        appendFeed(
          "The Relay could not bank that light yet. Move closer and try again.",
          "system",
        );
        return;
      }
      if (result.duplicate) {
        appendFeed("Your light at this source is already banked.", "system");
        return;
      }
      if (result.applied) {
        const completed = result.event?.phase === "completed";
        appendFeed(
          completed
            ? "Rainlight crosses the whole shore. Every contributor receives the same quest credit."
            : "Your light joins the Rainlight Relay. It stays banked even if you keep exploring.",
          "discovery",
        );
      }
    },
    [appendFeed, authUid, contributeRainlight, navigate],
  );

  const handleLanternkeeperStart = useCallback(async () => {
    if (!authUid) {
      navigate("/login");
      return;
    }
    const result = await startLanternkeeper();
    if (result.error) {
      appendFeed(
        "Juno's board could not open that route yet. Stand nearby and try again.",
        "system",
      );
      return;
    }
    if (result.applied || result.duplicate) {
      appendFeed(
        "Lanternkeeper Expedition opened. Other travelers may explicitly join; your first marker waits in the Conservatory.",
        "discovery",
      );
    }
  }, [appendFeed, authUid, navigate, startLanternkeeper]);

  const handleLanternkeeperJoin = useCallback(
    async (instanceId) => {
      if (!authUid) {
        navigate("/login");
        return;
      }
      const result = await joinLanternkeeper(instanceId);
      if (result.error) {
        appendFeed(
          "That expedition moved on before your place was confirmed. Choose another open route.",
          "system",
        );
        return;
      }
      if (result.applied || result.duplicate) {
        appendFeed(
          "You joined the Lanternkeeper party. No leader owns the route; any member may move the objective forward.",
          "discovery",
        );
      }
    },
    [appendFeed, authUid, joinLanternkeeper, navigate],
  );

  const handleLanternkeeperLeave = useCallback(async () => {
    const result = await leaveLanternkeeper();
    if (result.error) {
      appendFeed("The route could not release your place yet. Try once more.", "system");
      return;
    }
    if (!mutationWasConfirmed(result)) {
      appendFeed(
        "The route did not confirm that change. Your place remains as shown on the expedition board.",
        "system",
      );
      return;
    }
    nearbyExpeditionInstanceRef.current = null;
    setNearbyExpeditionTarget(null);
    appendFeed(
      "You leave the expedition without penalty. Everything already restored stays with the party.",
      "system",
    );
  }, [appendFeed, leaveLanternkeeper]);

  const handleLanternkeeperContribute = useCallback(
    async (targetId) => {
      if (!authUid) {
        navigate("/login");
        return;
      }
      await progressionSyncQueueRef.current.catch(() => null);
      const result = await contributeLanternkeeper(targetId);
      if (result.progression) {
        progressionDirtyRef.current = false;
        progressionSyncSequenceRef.current += 1;
        setWorldProgression(hydrateWorldProgression(result.progression));
        setProgressionHydratedUid(authUid);
      }
      if (result.error) {
        appendFeed(
          "That field marker did not answer. Stay inside its ring and follow the current party objective.",
          "system",
        );
        return;
      }
      if (result.duplicate) {
        appendFeed("Your attunement at this marker is already safe.", "system");
        return;
      }
      if (result.applied) {
        nearbyExpeditionInstanceRef.current = null;
        setNearbyExpeditionTarget(null);
        const confirmedQuest = result.progression
          ? selectQuestProgress(result.progression, LANTERNKEEPER_QUEST_ID)
          : null;
        const completionCopy = lanternkeeperCompletionCopy(
          confirmedQuest?.status,
        );
        appendFeed(
          result.completed
            ? completionCopy
            : "The party route advances. Your attunement persists if you disconnect or leave.",
          "discovery",
        );
      }
    },
    [appendFeed, authUid, contributeLanternkeeper, navigate],
  );

  const handleExpeditionTargetChange = useCallback(
    (target) => {
      if (
        target?.instanceId === lanternkeeperExpedition.expedition.instanceId &&
        lanternkeeperExpedition.personal.active
      ) {
        nearbyExpeditionInstanceRef.current = target.instanceId;
        setNearbyExpeditionTarget(target.targetId);
      } else {
        nearbyExpeditionInstanceRef.current = null;
        setNearbyExpeditionTarget(null);
      }
    },
    [
      lanternkeeperExpedition.expedition.instanceId,
      lanternkeeperExpedition.personal.active,
    ],
  );

  useEffect(() => {
    if (
      !lanternkeeperExpedition.personal.active ||
      nearbyExpeditionInstanceRef.current !==
        lanternkeeperExpedition.expedition.instanceId
    ) {
      nearbyExpeditionInstanceRef.current = null;
      setNearbyExpeditionTarget(null);
    }
  }, [
    lanternkeeperExpedition.expedition.instanceId,
    lanternkeeperExpedition.personal.active,
  ]);

  const recordJourneyEvent = useCallback((event) => {
    setNightJourney((current) => advanceNightJourney(current, event));
  }, []);

  const restartNightJourney = useCallback(() => {
    const nextJourney = createNightJourney();
    setNightJourney(
      nearbyId
        ? advanceNightJourney(nextJourney, {
            type: "visit",
            landmarkId: nearbyId,
          })
        : nextJourney,
    );
    appendFeed(
      "A new lantern thread wakes along the shoreline. Follow it at your own pace.",
      "discovery",
    );
  }, [appendFeed, nearbyId]);

  useEffect(() => {
    if (
      !nightJourney.completedAt ||
      !nightJourney.keepsake ||
      celebratedJourneyRef.current === nightJourney.id
    ) {
      return;
    }
    celebratedJourneyRef.current = nightJourney.id;
    const completedKeepsake = {
      ...nightJourney.keepsake,
      completedAt: nightJourney.completedAt,
    };
    setNightKeepsakes((current) =>
      hydrateNightKeepsakes([
        ...current.filter((entry) => entry.id !== completedKeepsake.id),
        completedKeepsake,
      ]),
    );
    appendFeed(
      `Night thread complete: ${nightJourney.keepsake.title}. A new question is yours to carry.`,
      "discovery",
    );
  }, [nightJourney, appendFeed]);

  const handleNextWorldFailure = useCallback(() => {
    setNextWorldFailed((failed) => {
      if (!failed) {
        appendFeed(
          "The enhanced world is unavailable, so compatibility mode is open.",
          "system",
        );
      }
      return true;
    });
  }, [appendFeed]);

  // Persist (per-user)
  useEffect(() => {
    saveState(authUid, {
      avatarColor,
      avatarAppearance,
      playerName,
      feed: feed.slice(-FEED_LIMIT),
      memories,
      chessRecord,
      worldLikes,
      worldProgression,
      nightJourney,
      nightKeepsakes,
      sharedMomentReceipts,
    });
  }, [
    authUid,
    avatarColor,
    avatarAppearance,
    playerName,
    feed,
    memories,
    chessRecord,
    worldLikes,
    worldProgression,
    nightJourney,
    nightKeepsakes,
    sharedMomentReceipts,
  ]);

  const handleNearbyChange = useCallback(
    (id) => {
      setNearbyId(id);
      if (id) {
        recordJourneyEvent({ type: "visit", landmarkId: id });
        recordProgressionEvent({
          type: WORLD_EVENT_TYPES.LANDMARK_VISITED,
          landmarkId: id,
        });
      }
      if (id && !memories[id]?.discovered) {
        const lm = LANDMARKS.find((l) => l.id === id);
        if (lm) {
          appendFeed(`You find your way to ${lm.name}.`, "discovery");
          setMemories((m) => ({
            ...m,
            [id]: { ...(m[id] || {}), discovered: true },
          }));
        }
      }
    },
    [memories, appendFeed, recordJourneyEvent, recordProgressionEvent],
  );

  const handlePlayerSnapshot = useCallback((snap) => {
    snapshotRef.current = snap;
    setSnapshotTick((n) => (n + 1) % 1000);
  }, []);

  const openLandmark = useCallback(
    (id) => {
      setActiveLandmarkId(id);
      setPaused(true);
      const lm = LANDMARKS.find((l) => l.id === id);
      if (lm) appendFeed(`You stop at ${lm.name}.`, "info");
    },
    [appendFeed],
  );

  const closeLandmark = useCallback(() => {
    setActiveLandmarkId(null);
    setPaused(false);
  }, []);

  // --- Dialogue flow ---
  const advanceDialogue = useCallback(
    (landmarkId) => {
      const lm = LANDMARKS.find((l) => l.id === landmarkId);
      const npc = lm?.npcId ? NPCS[lm.npcId] : null;
      if (!npc) return;
      const seen = memories[landmarkId]?.lineIndex ?? -1;
      const nextIndex = seen + 1;
      if (nextIndex >= npc.dialogue.length) {
        appendFeed(`${npc.name}: ${npc.farewell}`, "dialog");
        recordJourneyEvent({
          type: "moment",
          id: `${landmarkId}:conversation`,
        });
        setMemories((m) => ({
          ...m,
          [landmarkId]: {
            ...(m[landmarkId] || {}),
            discovered: true,
            lineIndex: -1,
          },
        }));
        closeLandmark();
        return;
      }
      const line = npc.dialogue[nextIndex];
      appendFeed(`${npc.name}: ${line}`, "dialog");
      setMemories((m) => ({
        ...m,
        [landmarkId]: {
          ...(m[landmarkId] || {}),
          discovered: true,
          lineIndex: nextIndex,
        },
      }));
    },
    [memories, appendFeed, closeLandmark, recordJourneyEvent],
  );

  const performActivity = useCallback(
    (landmarkId, activity) => {
      if (activity.kind === "expedition") {
        setActiveLandmarkId(null);
        appendFeed(
          "Juno's Lanternkeeper board unfolds beside the quest tracker. Start a route or explicitly join an open party.",
          "discovery",
        );
        return;
      }
      if (activity.kind === "publicEvent") {
        void handleRainlightContribute(activity.sourceId || landmarkId);
        return;
      }
      if (
        activity.kind === "minigame" ||
        activity.kind === "social" ||
        activity.kind === "cooperative"
      ) {
        // Open the lobby for this station.
        setActiveStationId(activity.stationId);
        return;
      }
      if (activity.kind === "quest") {
        appendFeed(activity.response, "discovery");
        recordProgressionEvent({
          type: WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
          questId: activity.questId,
          landmarkId,
          activityId: activity.id,
        });
        setMemories((current) => ({
          ...current,
          [landmarkId]: {
            ...(current[landmarkId] || {}),
            discovered: true,
            questFinds: {
              ...(current[landmarkId]?.questFinds || {}),
              [activity.id]: Date.now(),
            },
          },
        }));
        return;
      }
      if (activity.kind === "oneShot") {
        const consumed =
          memories[landmarkId]?.consumed?.[activity.id] === nightJourney.id;
        if (consumed) return;
        appendFeed(activity.response, "dialog");
        recordJourneyEvent({
          type: "moment",
          id: `${landmarkId}:${activity.id}`,
        });
        recordProgressionEvent({
          type: WORLD_EVENT_TYPES.PLACE_ACTIVITY_COMPLETED,
          landmarkId,
          activityId: activity.id,
        });
        if (activity.id === "reset-intent") {
          recordJourneyEvent({ type: "choice", choiceId: "quiet" });
        }
        setMemories((m) => ({
          ...m,
          [landmarkId]: {
            ...(m[landmarkId] || {}),
            discovered: true,
            consumed: {
              ...(m[landmarkId]?.consumed || {}),
              [activity.id]: nightJourney.id,
            },
          },
        }));
      }
    },
    [
      memories,
      appendFeed,
      nightJourney.id,
      recordJourneyEvent,
      recordProgressionEvent,
      handleRainlightContribute,
    ],
  );

  // --- Station lobby flows ---
  useEffect(() => {
    if (!activeStationId) return undefined;
    // Sit when entering lobby. Stand when leaving.
    sitAtStation();
    return () => {
      standAtStation();
    };
  }, [activeStationId, sitAtStation, standAtStation]);

  const handleLobbyMatchReady = useCallback(
    (match) => {
      if (activeMatchInfo?.id === match.id) return;
      setActiveMatchInfo(match);
      setSocialRoundHandoff(null);
      setSocialReplayRequest(null);
      socialReplayRunningRef.current = false;
      const opponent =
        match.white === myUid ? match.blackName : match.whiteName;
      appendFeed(
        stationMode === "resonance"
          ? `You and ${opponent || "another person"} step up to the Resonance Loom.`
          : stationMode === "social"
            ? `You and ${opponent || "another person"} settle into the Listening Crescent.`
            : `Match started against ${opponent || "another player"}.`,
        "discovery",
      );
    },
    [
      activeMatchInfo,
      appendFeed,
      myUid,
      setSocialRoundHandoff,
      stationMode,
    ],
  );

  const handleLobbyCancel = useCallback(() => {
    setActiveStationId(null);
    setActiveMatchInfo(null);
    setNpcChessActive(false);
    setSharedAfterglow(null);
    setSocialRoundHandoff(null);
    setSocialReplayRequest(null);
    socialReplayRunningRef.current = false;
  }, [setSocialRoundHandoff]);

  const handleLobbyPlayNpc = useCallback(() => {
    setNpcChessActive(true);
  }, []);

  const handleConsentActivityLeave = useCallback(() => {
    appendFeed(
      stationMode === "resonance"
        ? "You step away from the Resonance Loom. No explanation needed."
        : "You leave the Listening Crescent. No explanation needed.",
      "system",
    );
    handleLobbyCancel();
    closeLandmark();
  }, [appendFeed, closeLandmark, handleLobbyCancel, stationMode]);

  const handleResonancePulse = useCallback(
    async (round, tone, accuracy) => {
      const result = await submitResonance(round, tone, accuracy);
      if (result?.error) {
        appendFeed(
          "The Loom lost that note in the rain. Try the pulse again.",
          "system",
        );
      }
      return result;
    },
    [appendFeed, submitResonance],
  );

  const recordSharedMomentReceipt = useCallback(
    ({ mode, matchId, opponent }) => {
      const id = sharedMomentReceiptId(mode, matchId);
      if (!id || sharedReceiptIdsRef.current.has(id)) return false;

      sharedReceiptIdsRef.current.add(id);
      const completedAt = Date.now();
      setSharedMomentReceipts((current) =>
        appendSharedMomentReceipt(current, {
          mode,
          matchId,
          completedAt,
        }),
      );
      const progressionEvent = progressionEventFromSharedReceipt({
        id,
        mode,
        matchId,
        completedAt,
      });
      if (progressionEvent) recordProgressionEvent(progressionEvent);
      setMemories((current) => {
        if (mode === "resonance") {
          return {
            ...current,
            resonance: {
              ...(current.resonance || {}),
              discovered: true,
              duetCount: (current.resonance?.duetCount || 0) + 1,
              lastDuetAt: completedAt,
              lastDuetWith: String(
                opponent?.name || "another person",
              ).slice(0, 30),
            },
          };
        }
        return {
          ...current,
          market: {
            ...(current.market || {}),
            discovered: true,
            listeningCount: (current.market?.listeningCount || 0) + 1,
            lastListeningAt: completedAt,
          },
        };
      });
      recordJourneyEvent({ type: "moment", id });
      recordJourneyEvent({ type: "choice", choiceId: "shared" });
      appendFeed(
        mode === "resonance"
          ? `You and ${opponent?.name || "another person"} leave a shared song in the Garden.`
          : `You and ${opponent?.name || "another person"} carry one good question back into the Market.`,
        "discovery",
      );
      return true;
    },
    [appendFeed, recordJourneyEvent, recordProgressionEvent],
  );

  const handleResonanceResolved = useCallback(
    ({ matchId, opponent, prompt }) => {
      if (!matchId) return;
      const livePlayer = visibleRemotePlayers.find(
        (player) => player.uid === opponent?.uid,
      );
      const safeOpponent = {
        uid: opponent?.uid || null,
        name: livePlayer?.name || opponent?.name || "another person",
        color: livePlayer?.color || opponent?.color || "#c7a4ff",
        intent: livePlayer?.intent || "meet",
      };
      recordSharedMomentReceipt({
        mode: "resonance",
        matchId,
        opponent: safeOpponent,
      });
      setSharedAfterglow((current) =>
        current?.matchId === matchId
          ? current
          : {
              stationId: activeStationId,
              matchId,
              mode: "resonance",
              opponent: safeOpponent,
              prompt,
              ready: false,
            },
      );
      Promise.resolve(acknowledgeCompletion()).then((result) => {
        if (result?.error) {
          appendFeed(
            "Your private duet receipt is safe here, but the shared handoff is taking longer than usual.",
            "system",
          );
        }
      });
    },
    [
      acknowledgeCompletion,
      activeStationId,
      appendFeed,
      recordSharedMomentReceipt,
      visibleRemotePlayers,
    ],
  );

  const releaseSocialRound = useCallback(
    (matchId) => {
      if (!matchId) return;
      const current = socialRoundHandoffRef.current;
      if (
        current?.matchId !== matchId ||
        current.ready ||
        current.releasing
      ) {
        return;
      }
      setSocialRoundHandoff({
        ...current,
        ackError: false,
        acknowledging: false,
        releasing: true,
      });
      Promise.resolve(standAtStation()).then(() => {
        setSocialRoundHandoff((current) =>
          current?.matchId === matchId
            ? { ...current, ready: true, releasing: false }
            : current,
        );
      });
    },
    [setSocialRoundHandoff, standAtStation],
  );

  const confirmSocialHandoff = useCallback(
    (matchId, outcome) => {
      if (!matchId || !outcome) return;
      const current = socialRoundHandoffRef.current;
      if (
        current?.matchId !== matchId ||
        current.ready ||
        current.releasing ||
        current.acknowledging
      ) {
        return;
      }
      setSocialRoundHandoff({
        ...current,
        ackError: false,
        acknowledging: true,
      });
      Promise.resolve(acknowledgeCompletion()).then((result) => {
        const activeHandoff = socialRoundHandoffRef.current;
        if (
          activeHandoff?.matchId !== matchId ||
          activeHandoff.ready ||
          activeHandoff.releasing
        ) {
          return;
        }
        if (result?.error) {
          setSocialRoundHandoff({
            ...activeHandoff,
            ackError: true,
            acknowledging: false,
          });
          appendFeed(
            outcome.completed
              ? "Your private listening receipt is safe on this device, but the shared reveal needs another try."
              : "Your pass is safe, but the Crescent needs another try to close this round.",
            "system",
          );
          return;
        }
        setSocialRoundHandoff({
          ...activeHandoff,
          ackError: false,
          acknowledging: false,
        });
        if (outcome.passed) releaseSocialRound(matchId);
      });
    },
    [
      acknowledgeCompletion,
      appendFeed,
      releaseSocialRound,
      setSocialRoundHandoff,
    ],
  );

  const handleSocialMomentResolved = useCallback(
    (outcome) => {
      const liveMatch =
        station.match?.id === outcome?.matchId
          ? station.match
          : activeMatchInfo?.id === outcome?.matchId
            ? activeMatchInfo
            : null;
      if (!outcome?.matchId || !liveMatch) return;
      const opponent = socialOpponentFor(
        liveMatch,
        myUid,
        visibleRemotePlayers,
      );
      if (outcome.completed) {
        recordSharedMomentReceipt({
          mode: "social",
          matchId: outcome.matchId,
          opponent,
        });
      }
      setSocialRoundHandoff((current) =>
        current?.matchId === outcome.matchId
          ? current
          : {
              stationId: activeStationId,
              matchId: outcome.matchId,
              startedAt: Number(liveMatch.startedAt) || Date.now(),
              opponent,
              prompt: outcome.card?.prompt,
              outcome,
              ready: false,
              releasing: false,
              acknowledging: false,
              ackError: false,
            },
      );
      confirmSocialHandoff(outcome.matchId, outcome);
    },
    [
      activeMatchInfo,
      activeStationId,
      confirmSocialHandoff,
      myUid,
      recordSharedMomentReceipt,
      setSocialRoundHandoff,
      station.match,
      visibleRemotePlayers,
    ],
  );

  const handleSocialHandoffRetry = useCallback(() => {
    if (
      !socialRoundHandoff?.matchId ||
      !socialRoundHandoff.outcome ||
      socialRoundHandoff.acknowledging
    ) {
      return;
    }
    confirmSocialHandoff(
      socialRoundHandoff.matchId,
      socialRoundHandoff.outcome,
    );
  }, [confirmSocialHandoff, socialRoundHandoff]);

  const handleSocialMomentComplete = useCallback(
    (outcome) => {
      if (
        !outcome?.completed ||
        socialRoundHandoff?.matchId !== outcome.matchId ||
        !socialRoundHandoff.ready
      ) {
        return;
      }
      setSharedAfterglow({
        stationId: activeStationId,
        matchId: outcome.matchId,
        mode: "social",
        opponent: socialRoundHandoff.opponent,
        prompt:
          socialRoundHandoff.prompt ||
          "What part of this moment do you want to carry into the rest of your night?",
        ready: true,
      });
      setSocialRoundHandoff(null);
    }, [activeStationId, setSocialRoundHandoff, socialRoundHandoff]);

  const handleSocialMomentReplay = useCallback(() => {
    const match = activeMatchInfo;
    if (
      socialReplayRequest ||
      !match?.id ||
      (socialRoundHandoff?.matchId === match.id &&
        !socialRoundHandoff.ready)
    ) {
      return;
    }
    const opponentUid = match.white === myUid ? match.black : match.white;
    const opponentSeatSessionId =
      match.white === myUid
        ? match.blackSeatSessionId
        : match.whiteSeatSessionId;
    setSocialReplayRequest({
      matchId: match.id,
      opponentUid,
      opponentSeatSessionId: opponentSeatSessionId || null,
    });
  }, [
    activeMatchInfo,
    myUid,
    socialReplayRequest,
    socialRoundHandoff,
  ]);

  useEffect(() => {
    const nextCompletionAcks = station.completionAcks || {};
    const nextSocialChoices = station.socialChoices || {};
    if (
      stationMode !== "social" ||
      !station.match?.id ||
      station.match.id !== activeMatchInfo?.id ||
      (!Object.keys(nextCompletionAcks).length &&
        !Object.keys(nextSocialChoices).length)
    ) {
      return;
    }
    setActiveMatchInfo((current) =>
      current?.id === station.match.id
        ? {
            ...current,
            ...(Object.keys(nextCompletionAcks).length
              ? { completionAcks: nextCompletionAcks }
              : {}),
            ...(Object.keys(nextSocialChoices).length
              ? { socialChoices: nextSocialChoices }
              : {}),
          }
        : current,
    );
  }, [
    activeMatchInfo?.id,
    station.completionAcks,
    station.match,
    station.socialChoices,
    stationMode,
  ]);

  useEffect(() => {
    if (
      !socialRoundHandoff ||
      socialRoundHandoff.ready ||
      socialRoundHandoff.releasing
    ) {
      return;
    }
    const match =
      station.match?.id === socialRoundHandoff.matchId
        ? station.match
        : activeMatchInfo?.id === socialRoundHandoff.matchId
          ? activeMatchInfo
          : null;
    const participantIds = [match?.white, match?.black].filter(Boolean);
    const bothReceived =
      station.fullyAcknowledgedMatchIds?.includes(
        socialRoundHandoff.matchId,
      ) ||
      (participantIds.length === 2 &&
        participantIds.every(
          (uid) =>
            station.completionAcks?.[uid]?.matchId ===
              socialRoundHandoff.matchId ||
            match?.completionAcks?.[uid]?.matchId ===
              socialRoundHandoff.matchId,
        ));
    const oldMatchGone = station.match?.id !== socialRoundHandoff.matchId;
    if (socialRoundHandoff.outcome?.passed && !oldMatchGone) return;
    if (!bothReceived && !oldMatchGone) return;
    releaseSocialRound(socialRoundHandoff.matchId);
  }, [
    activeMatchInfo,
    releaseSocialRound,
    socialRoundHandoff,
    station.completionAcks,
    station.fullyAcknowledgedMatchIds,
    station.match,
  ]);

  useEffect(() => {
    if (!socialReplayRequest || socialReplayRunningRef.current) return;
    if (station.match?.id === socialReplayRequest.matchId) return;

    const opponentSeat = station.seats?.[socialReplayRequest.opponentUid];
    const opponentStillInOldRound = Boolean(
      opponentSeat &&
        (!socialReplayRequest.opponentSeatSessionId ||
          opponentSeat.sessionId === socialReplayRequest.opponentSeatSessionId),
    );
    if (opponentStillInOldRound) return;

    socialReplayRunningRef.current = true;
    const replayedMatchId = socialReplayRequest.matchId;
    Promise.resolve(sitAtStation())
      .then(() => {
        setActiveMatchInfo(null);
        setSocialRoundHandoff(null);
        setSocialReplayRequest(null);
        appendFeed(
          "You open a fresh place in the Crescent. A new round begins only when someone joins you.",
          "system",
        );
      })
      .finally(() => {
        socialReplayRunningRef.current = false;
        departedSocialMatchesRef.current.delete(replayedMatchId);
      });
  }, [
    appendFeed,
    setSocialRoundHandoff,
    sitAtStation,
    socialReplayRequest,
    station.match,
    station.seats,
  ]);

  useEffect(() => {
    if (
      !sharedAfterglow ||
      sharedAfterglow.mode !== "resonance" ||
      sharedAfterglow.ready ||
      sharedAfterglow.releasing
    ) {
      return;
    }
    const match =
      station.match?.id === sharedAfterglow.matchId
        ? station.match
        : activeMatchInfo?.id === sharedAfterglow.matchId
          ? activeMatchInfo
          : null;
    const participantIds = [match?.white, match?.black].filter(Boolean);
    const bothReceived =
      station.fullyAcknowledgedMatchIds?.includes(sharedAfterglow.matchId) ||
      (participantIds.length === 2 &&
        participantIds.every(
          (uid) =>
            station.completionAcks?.[uid]?.matchId === sharedAfterglow.matchId,
        ));
    if (bothReceived) {
      setSharedAfterglow((current) =>
        current?.matchId === sharedAfterglow.matchId
          ? { ...current, releasing: true }
          : current,
      );
      Promise.resolve(standAtStation()).then(() => {
        setSharedAfterglow((current) =>
          current?.matchId === sharedAfterglow.matchId
            ? { ...current, ready: true, releasing: false }
            : current,
        );
      });
    }
  }, [
    activeMatchInfo,
    sharedAfterglow,
    station.completionAcks,
    station.fullyAcknowledgedMatchIds,
    station.match,
    standAtStation,
  ]);

  // The RTDB acknowledgement closes the activity immediately; the trusted
  // trigger then creates a private, short-lived continuation choice. Poll only
  // for this exact completed shared activity and never hold Return/Replay
  // hostage to it.
  useEffect(() => {
    if (
      !authUid ||
      !["resonance", "social"].includes(sharedAfterglow?.mode) ||
      !sharedAfterglow.ready ||
      !sharedAfterglow.matchId ||
      verifiedAfterglowEncounter ||
      sharedAfterglow.encounterUnavailable
    ) {
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    let attempt = 0;
    const refresh = () => {
      attempt += 1;
      Promise.resolve(refreshSharedEncounters()).then((result) => {
        if (cancelled) return;
        if (
          sharedEncounterForAfterglow(
            result?.encounters,
            sharedAfterglow,
          )
        ) {
          return;
        }
        if (attempt >= 8) {
          setSharedAfterglow((current) =>
            current?.matchId === sharedAfterglow.matchId
              ? { ...current, encounterUnavailable: true }
              : current,
          );
          return;
        }
        timer = window.setTimeout(refresh, 1_500);
      });
    };
    refresh();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    authUid,
    sharedAfterglow,
    refreshSharedEncounters,
    verifiedAfterglowEncounter,
  ]);

  // A one-way Spark stays private. While its Afterglow remains open, do a
  // short bounded refresh window so a mutual response can appear without a
  // reload; returning to the district stops all polling immediately.
  useEffect(() => {
    if (
      !authUid ||
      !["resonance", "social"].includes(sharedAfterglow?.mode) ||
      !sharedAfterglow.ready ||
      verifiedAfterglowEncounter?.state !== "pending"
    ) {
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    let attempt = 0;
    const refresh = () => {
      attempt += 1;
      Promise.resolve(refreshSharedEncounters()).finally(() => {
        if (cancelled || attempt >= 12) return;
        timer = window.setTimeout(refresh, 2_500);
      });
    };
    timer = window.setTimeout(refresh, 2_500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    authUid,
    refreshSharedEncounters,
    sharedAfterglow,
    verifiedAfterglowEncounter?.state,
  ]);

  useEffect(() => {
    const encounter = verifiedAfterglowEncounter;
    if (
      encounter?.state !== "mutual" ||
      !encounter.matchId ||
      !encounter.opponent?.uid
    ) {
      return;
    }
    setMutualMatches((current) =>
      current[encounter.opponent.uid] === encounter.matchId
        ? current
        : { ...current, [encounter.opponent.uid]: encounter.matchId },
    );
  }, [verifiedAfterglowEncounter]);

  const handleAfterglowReturn = useCallback(() => {
    appendFeed(
      "You return to the district. The shared moment stays in your private journal.",
      "system",
    );
    handleLobbyCancel();
    setActiveLandmarkId(null);
  }, [appendFeed, handleLobbyCancel]);

  const handleAfterglowViewProfile = useCallback(() => {
    const opponent = sharedAfterglow?.opponent;
    handleLobbyCancel();
    setActiveLandmarkId(null);
    if (!opponent?.uid) return;
    setProfileTarget({
      uid: opponent.uid,
      name: opponent.name || "Wayfarer",
      color: opponent.color || "#c7a4ff",
      intent: opponent.intent || "meet",
    });
  }, [handleLobbyCancel, sharedAfterglow]);

  const handleAfterglowSpark = useCallback(
    async (encounterId) => {
      if (!encounterId || !verifiedAfterglowEncounter) return;
      const result = await sendSharedEncounterSpark(encounterId);
      if (result?.error) {
        appendFeed(
          "That private choice could not be confirmed yet. Your duet and quest progress are unchanged.",
          "system",
        );
        return;
      }
      const connectionId = result?.matchId || result?.encounter?.matchId;
      const opponent = verifiedAfterglowEncounter.opponent;
      if (result?.mutual || result?.encounter?.state === "mutual") {
        if (opponent?.uid && connectionId) {
          setMutualMatches((current) => ({
            ...current,
            [opponent.uid]: connectionId,
          }));
        }
        appendFeed(
          `Your Spark with ${opponent?.name || "this traveler"} is mutual. A private connection is ready when you both want it.`,
          "discovery",
        );
      } else {
        appendFeed(
          "Your Spark is saved privately. Nothing is revealed unless it becomes mutual.",
          "system",
        );
      }
      recordJourneyEvent({ type: "choice", choiceId: "spark" });
    },
    [
      appendFeed,
      recordJourneyEvent,
      sendSharedEncounterSpark,
      verifiedAfterglowEncounter,
    ],
  );

  const handleAfterglowPass = useCallback(
    async (encounterId) => {
      if (!encounterId || !verifiedAfterglowEncounter) return;
      const result = await passSharedEncounter(encounterId);
      if (result?.error) {
        appendFeed(
          "That private choice could not be confirmed yet. You can still return without penalty.",
          "system",
        );
        return;
      }
      appendFeed(
        "You pass on continuing. Nothing is sent, and the shared moment still counts in full.",
        "system",
      );
    },
    [appendFeed, passSharedEncounter, verifiedAfterglowEncounter],
  );

  const handleAfterglowReplay = useCallback(() => {
    if (!sharedAfterglow?.ready) return;
    setSharedAfterglow((current) =>
      current
        ? { ...current, ready: false, requeueing: true }
        : current,
    );
    appendFeed(
      "A fresh place is opening in the queue. You will only pair with someone who joins too.",
      "system",
    );
  }, [appendFeed, sharedAfterglow]);

  useEffect(() => {
    if (
      !sharedAfterglow?.requeueing ||
      sharedAfterglow.requeueStarted ||
      station.match
    ) {
      return;
    }
    const matchId = sharedAfterglow.matchId;
    setSharedAfterglow((current) =>
      current?.matchId === matchId
        ? { ...current, requeueStarted: true }
        : current,
    );
    Promise.resolve(sitAtStation()).then(() => {
      setActiveMatchInfo(null);
      setSharedAfterglow((current) =>
        current?.matchId === matchId ? null : current,
      );
    });
  }, [sharedAfterglow, sitAtStation, station.match]);

  useEffect(() => {
    if (
      stationMode === "chess" ||
      !activeMatchInfo ||
      station.match?.id === activeMatchInfo.id
    ) {
      return;
    }
    if (sharedAfterglow?.matchId === activeMatchInfo.id) {
      setActiveMatchInfo(null);
      return;
    }
    if (stationMode === "social") {
      const handoffIsActive =
        socialRoundHandoff?.matchId === activeMatchInfo.id;
      if (
        !handoffIsActive &&
        !departedSocialMatchesRef.current.has(activeMatchInfo.id)
      ) {
        departedSocialMatchesRef.current.add(activeMatchInfo.id);
        Promise.resolve(standAtStation());
        appendFeed(
          "The other person left before the reveal. This round stays closed, and your place is no longer held in the queue.",
          "system",
        );
      }
      return;
    }
    if (station.match) return;
    setActiveMatchInfo(null);
    appendFeed(
      "The other person has left. Your place in the queue is still yours.",
      "system",
    );
  }, [
    stationMode,
    activeMatchInfo,
    station.match,
    sharedAfterglow,
    socialRoundHandoff,
    standAtStation,
    appendFeed,
  ]);

  const handleChessResult = useCallback((result) => {
    setChessRecord((r) => ({
      wins: r.wins + (result === "win" ? 1 : 0),
      losses: r.losses + (result === "loss" ? 1 : 0),
      draws: r.draws + (result === "draw" ? 1 : 0),
    }));
    recordJourneyEvent({
      type: "moment",
      id: `chess:${Date.now()}:${result}`,
    });
  }, [recordJourneyEvent]);

  const handleWorldAction = useCallback(
    (request) => {
      const action =
        typeof request === "string" ? request : request?.action || null;
      if (action === "escape") {
        if (chatOpen) {
          setChatOpen(false);
        } else if (emoteOpen) {
          setEmoteOpen(false);
        } else if (avatarStudioOpen) {
          setAvatarStudioOpen(false);
        } else if (showArrival) {
          if (sessionIntent) setShowArrival(false);
        } else if (activeStationId) {
          handleLobbyCancel();
        } else if (profileTarget) {
          setProfileTarget(null);
        } else if (activeLandmarkId) {
          closeLandmark();
        }
        return;
      }

      if (paused || activeStationId) return;
      if (
        action === "expedition-contribute" &&
        request?.target?.kind === "expedition" &&
        request.target.instanceId ===
          lanternkeeperExpedition.expedition.instanceId &&
        lanternkeeperExpedition.availableTargets.includes(
          request.target.targetId,
        )
      ) {
        void handleLanternkeeperContribute(request.target.targetId);
      } else if (
        action === "interact" &&
        nearbyExpeditionTarget &&
        lanternkeeperExpedition.availableTargets.includes(
          nearbyExpeditionTarget,
        )
      ) {
        void handleLanternkeeperContribute(nearbyExpeditionTarget);
      } else if (action === "interact" && nearbyId) {
        openLandmark(nearbyId);
      } else if (action === "emote" && !emoteOpen && !chatOpen) {
        setEmoteOpen(true);
      } else if (action === "chat" && !chatOpen && !emoteOpen) {
        setChatOpen(true);
      }
    },
    [
      activeLandmarkId,
      activeStationId,
      avatarStudioOpen,
      chatOpen,
      closeLandmark,
      emoteOpen,
      handleLobbyCancel,
      handleLanternkeeperContribute,
      lanternkeeperExpedition.availableTargets,
      lanternkeeperExpedition.expedition.instanceId,
      nearbyId,
      nearbyExpeditionTarget,
      openLandmark,
      paused,
      profileTarget,
      sessionIntent,
      showArrival,
    ],
  );

  // Shell shortcuts work while the shell has focus. The embedded renderer
  // forwards the same actions when its canvas owns focus.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      handleWorldAction("escape");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleWorldAction]);

  // E to interact, Q to emote, T to chat — only when not in a modal/lobby
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable)
        return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const action = { KeyE: "interact", KeyQ: "emote", KeyT: "chat" }[e.code];
      if (!action) return;
      e.preventDefault();
      handleWorldAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleWorldAction]);

  const handleEmote = useCallback((emoteId) => {
    extrasRef.current = {
      ...(extrasRef.current || {}),
      emote: { type: emoteId, at: Date.now() },
    };
    setEmoteOpen(false);
  }, []);

  const handleSayMessage = useCallback(
    (text) => {
      extrasRef.current = {
        ...(extrasRef.current || {}),
        say: { text, at: Date.now() },
      };
      appendFeed(`You: ${text}`, "dialog");
    },
    [appendFeed],
  );

  // Pause world when modals are open
  useEffect(() => {
    setPaused(
      Boolean(
        showArrival ||
          activeLandmarkId ||
          activeStationId ||
          profileTarget ||
          avatarStudioOpen,
      ),
    );
  }, [
    showArrival,
    activeLandmarkId,
    activeStationId,
    profileTarget,
    avatarStudioOpen,
  ]);

  // --- Remote player click → profile card
  const handleRemotePlayerClick = useCallback((uid, snapshot) => {
    setProfileTarget({
      uid,
      name: snapshot.name,
      color: snapshot.color,
      intent: snapshot.intent,
    });
  }, []);

  const handleWave = useCallback(async () => {
    if (!profileTarget || !myUid) return;
    const result = await sendSignal({
      toUid: profileTarget.uid,
      type: "wave",
    });
    if (!result.ok) {
      appendFeed(
        "That approach did not send. Check your connection and try again.",
        "system",
      );
      return;
    }
    appendFeed(
      `You ask ${profileTarget.name} if they're open to saying hello.`,
      "system",
    );
    recordJourneyEvent({ type: "choice", choiceId: "approach" });
  }, [
    profileTarget,
    myUid,
    appendFeed,
    recordJourneyEvent,
  ]);

  const handleInviteChess = useCallback(async () => {
    if (!profileTarget || !myUid) return;
    const result = await sendSignal({
      toUid: profileTarget.uid,
      type: "invite-chess",
    });
    if (!result.ok) {
      appendFeed(
        "That invitation did not send. Check your connection and try again.",
        "system",
      );
      return;
    }
    appendFeed(
      `You invite ${profileTarget.name} to a quick two-person game.`,
      "system",
    );
    setProfileTarget(null);
    setActiveLandmarkId(null);
    setActiveStationId(
      privateActivityStation("chess", myUid, profileTarget.uid),
    );
  }, [profileTarget, myUid, appendFeed]);

  const enterWorld = useCallback(() => {
    setSessionIntent(arrivalChoice);
    saveSessionIntent(authUid, arrivalChoice);
    setShowArrival(false);
    const selected = SESSION_INTENTS.find(
      (intent) => intent.id === arrivalChoice,
    );
    const text = `Tonight: ${selected?.title || "Explore"}.`;
    setFeed((previous) => {
      if (previous.at(-1)?.text === text) return previous;
      return [...previous, makeFeedEntry(text, "system")].slice(-8);
    });
  }, [arrivalChoice, authUid]);

  const leaveQuietly = useCallback(() => {
    saveSessionIntent(authUid, null);
    setSessionIntent(null);
    setArrivalChoice("meet");
    setShowArrival(true);
    setProfileTarget(null);
    setActiveLandmarkId(null);
    setActiveStationId(null);
  }, [authUid]);

  const respondToInvite = useCallback(
    async (accepted) => {
      const invite = pendingInviteSignal;
      if (!invite || !myUid) return;
      const result = await sendSignal({
        toUid: invite.fromUid,
        type: accepted ? "invite-chess-accepted" : "invite-chess-declined",
        replyToActionId: invite.actionId,
      });
      if (!result.ok) {
        appendFeed(
          "That invitation response did not send. Please try again.",
          "system",
        );
        return;
      }
      setPendingInviteSignal(null);
      if (accepted) {
        setActiveLandmarkId(null);
        setActiveStationId(
          privateActivityStation("chess", myUid, invite.fromUid),
        );
        appendFeed(
          `You join ${invite.fromName || "the invitation"} for a quick game.`,
          "discovery",
        );
      }
    },
    [
      pendingInviteSignal,
      myUid,
      appendFeed,
    ],
  );

  const handleMutePlayer = useCallback(() => {
    if (!profileTarget) return;
    setMutedUsers((current) =>
      current.includes(profileTarget.uid)
        ? current
        : [...current, profileTarget.uid],
    );
    appendFeed(
      `${profileTarget.name}'s public messages are muted for this visit.`,
      "system",
    );
    setProfileTarget(null);
  }, [profileTarget, appendFeed]);

  const handleBlockPlayer = useCallback(async () => {
    if (!profileTarget) return;
    const confirmed = window.confirm(
      `Block ${profileTarget.name}? You will no longer see each other in DateScape.`,
    );
    if (!confirmed) return;
    try {
      await blockUser(profileTarget.uid);
      setBlockedUsers((current) =>
        current.includes(profileTarget.uid)
          ? current
          : [...current, profileTarget.uid],
      );
      appendFeed(
        `${profileTarget.name} has been removed from your world.`,
        "system",
      );
      setProfileTarget(null);
    } catch {
      appendFeed(
        "The block could not be saved. Try again before continuing.",
        "system",
      );
    }
  }, [profileTarget, appendFeed]);

  const handleReportPlayer = useCallback(async () => {
    if (!profileTarget) return;
    const reason = window.prompt("What happened? Your report is private.");
    if (reason === null) return;
    try {
      await reportUser(profileTarget.uid, reason || "World encounter");
      appendFeed("Thank you. The report was sent for review.", "system");
      setProfileTarget(null);
    } catch {
      appendFeed("The report did not send. Please try again.", "system");
    }
  }, [profileTarget, appendFeed]);

  const handleQuestAccept = useCallback(
    async (questId) => {
      const quest = selectQuestProgress(worldProgression, questId);
      if (quest?.status !== "available" || !quest.giverNpcId) return;
      const result = await recordProgressionEvent({
        type: WORLD_EVENT_TYPES.QUEST_ACCEPTED,
        questId,
        npcId: quest.giverNpcId,
      });
      const confirmedQuest = result?.progression
        ? selectQuestProgress(result.progression, questId)
        : null;
      const acceptanceConfirmed = questActionIsConfirmed(
        "accept",
        confirmedQuest?.status,
      );
      if (authUid && !acceptanceConfirmed) {
        appendFeed(
          result?.ignored || result?.error || !result?.progression
            ? `${quest.title} could not be accepted yet. Stay near ${NPCS[quest.giverNpcId]?.name || "the quest giver"} and try again.`
            : `${quest.title} was not opened by the server. Your quest log was refreshed.`,
          "system",
        );
        return;
      }
      if (authUid && confirmedQuest?.status === "completed") {
        appendFeed(
          `${quest.title} is already complete. Your quest log was refreshed.`,
          "system",
        );
        return;
      }
      const firstObjective = quest.objectives.find(
        (objective) => objective.status === "locked" || objective.status === "current",
      );
      appendFeed(
        `Quest accepted: ${quest.title}.${firstObjective ? ` ${firstObjective.label}.` : ""}`,
        "discovery",
      );
    },
    [appendFeed, authUid, recordProgressionEvent, worldProgression],
  );

  const handleQuestTurnIn = useCallback(
    async (questId) => {
      const quest = selectQuestProgress(worldProgression, questId);
      if (quest?.status !== "ready-to-turn-in" || !quest.turnInNpcId) {
        return;
      }
      const result = await recordProgressionEvent({
        type: WORLD_EVENT_TYPES.QUEST_TURNED_IN,
        questId,
        npcId: quest.turnInNpcId,
      });
      const confirmedQuest = result?.progression
        ? selectQuestProgress(result.progression, questId)
        : null;
      const turnInConfirmed = questActionIsConfirmed(
        "turn-in",
        confirmedQuest?.status,
      );
      if (authUid && !turnInConfirmed) {
        appendFeed(
          result?.ignored || result?.error || !result?.progression
            ? `${quest.title} is still safe, but its reward could not be claimed yet. Try ${NPCS[quest.turnInNpcId]?.name || "the quest giver"} again in a moment.`
            : `${quest.title} still has an authoritative objective to finish. Your progress was refreshed.`,
          "system",
        );
        return;
      }
      const cosmeticName = quest.rewards.cosmetics[0]?.name;
      appendFeed(
        `Quest complete: +${quest.rewards.xp} XP${cosmeticName ? ` and ${cosmeticName}` : ""}. You reached a new wayfarer level.`,
        "discovery",
      );
      setActiveLandmarkId(null);
      setAvatarStudioOpen(true);
    },
    [appendFeed, authUid, recordProgressionEvent, worldProgression],
  );

  const handleAvatarSave = useCallback(
    (nextAppearance) => {
      const safe = publicAvatarAppearance(nextAppearance);
      if (
        !trimIsUnlocked(
          safe.outfit.trim,
          worldProgression.unlockedCosmetics,
        ) ||
        !accessoryIsUnlocked(
          safe.accessory,
          worldProgression.unlockedCosmetics,
        )
      ) {
        return;
      }
      setAvatarAppearance(safe);
      setAvatarStudioOpen(false);
      appendFeed("Your new look is equipped across Afterlight.", "system");
    },
    [appendFeed, worldProgression.unlockedCosmetics],
  );

  // Equipped quest cosmetics are a projection of authoritative inventory.
  // If a stale optimistic cache is rolled back, fall back to catalog defaults
  // before presence publishes an appearance the rules would reject.
  useEffect(() => {
    if (!avatarAuthorityReady) return;
    setAvatarAppearance((current) => {
      const safe = publicAvatarAppearance(current);
      const trimAllowed = trimIsUnlocked(
        safe.outfit.trim,
        worldProgression.unlockedCosmetics,
      );
      const accessoryAllowed = accessoryIsUnlocked(
        safe.accessory,
        worldProgression.unlockedCosmetics,
      );
      if (trimAllowed && accessoryAllowed) return current;
      return {
        ...safe,
        outfit: {
          ...safe.outfit,
          trim: trimAllowed ? safe.outfit.trim : "accent",
        },
        accessory: accessoryAllowed
          ? safe.accessory
          : "aged-bronze-fittings",
      };
    });
  }, [avatarAuthorityReady, worldProgression.unlockedCosmetics]);

  const activeLandmark = activeLandmarkId
    ? LANDMARKS.find((l) => l.id === activeLandmarkId)
    : null;
  const activeNpc = activeLandmark?.npcId ? NPCS[activeLandmark.npcId] : null;
  const nearbyLandmark = nearbyId
    ? LANDMARKS.find((l) => l.id === nearbyId)
    : null;
  const journeyProgress = useMemo(
    () => nightJourneyProgress(nightJourney),
    [nightJourney],
  );
  const rendererJourneyState = useMemo(
    () => nightJourneyBridgeState(nightJourney),
    [nightJourney],
  );
  const levelProgress = useMemo(
    () => selectLevelProgress(worldProgression),
    [worldProgression],
  );
  const activeQuests = useMemo(
    () => selectActiveQuests(worldProgression),
    [worldProgression],
  );
  const availableQuests = useMemo(
    () => selectAvailableQuests(worldProgression),
    [worldProgression],
  );
  const lanternkeeperQuestProgress = useMemo(
    () => selectQuestProgress(worldProgression, LANTERNKEEPER_QUEST_ID),
    [worldProgression],
  );
  const primaryQuest = activeQuests[0] || availableQuests[0] || null;
  const primaryGiverNpc = primaryQuest
    ? NPCS[primaryQuest.giverNpcId] || null
    : null;
  const primaryTurnInNpc = primaryQuest
    ? NPCS[primaryQuest.turnInNpcId] || null
    : null;
  const primaryGiverLandmark = primaryGiverNpc
    ? LANDMARKS.find(
        (landmark) => landmark.id === primaryGiverNpc.homeLandmarkId,
      )
    : null;
  const primaryTurnInLandmark = primaryTurnInNpc
    ? LANDMARKS.find(
        (landmark) => landmark.id === primaryTurnInNpc.homeLandmarkId,
      )
    : null;
  const activeNpcQuest = activeLandmark?.npcId
    ? activeQuests.find(
        (quest) =>
          quest.turnInNpcId === activeLandmark.npcId &&
          quest.status === "ready-to-turn-in",
      ) ||
      activeQuests.find(
        (quest) => quest.giverNpcId === activeLandmark.npcId,
      ) ||
      availableQuests.find(
        (quest) => quest.giverNpcId === activeLandmark.npcId,
      ) ||
      null
    : null;
  const primaryObjective =
    primaryQuest?.objectives.find(
      (objective) => objective.id === primaryQuest.currentObjectiveId,
    ) || null;
  const canOfferResonanceEcho = resonanceEchoIsEligible(
    primaryQuest,
    primaryObjective,
  );
  const hasOtherResonanceSeat = Object.keys(station.seats || {}).some(
    (uid) => uid !== myUid,
  );

  useEffect(() => {
    if (activeStationId === "resonance-duet") return;
    clearResonanceEcho();
  }, [activeStationId, clearResonanceEcho]);

  const handleResonanceEchoStart = useCallback(async () => {
    if (
      !authUid ||
      auth.currentUser?.uid !== authUid ||
      activeStationId !== "resonance-duet" ||
      !canOfferResonanceEcho ||
      hasOtherResonanceSeat ||
      activeMatchInfo
    ) {
      return { ignored: true };
    }
    const result = await startResonanceEchoWait();
    if (result?.progression) {
      progressionDirtyRef.current = false;
      progressionSyncSequenceRef.current += 1;
      setWorldProgression(hydrateWorldProgression(result.progression));
      setProgressionHydratedUid(authUid);
    }
    return result;
  }, [
    activeMatchInfo,
    activeStationId,
    authUid,
    canOfferResonanceEcho,
    hasOtherResonanceSeat,
    startResonanceEchoWait,
  ]);

  useEffect(() => {
    if (
      !authUid ||
      activeStationId !== "resonance-duet" ||
      !canOfferResonanceEcho ||
      hasOtherResonanceSeat ||
      activeMatchInfo ||
      resonanceEcho.echo.phase !== "idle" ||
      resonanceEcho.busy ||
      resonanceEcho.error
    ) {
      return;
    }
    void handleResonanceEchoStart();
  }, [
    activeMatchInfo,
    activeStationId,
    authUid,
    canOfferResonanceEcho,
    hasOtherResonanceSeat,
    resonanceEcho.busy,
    resonanceEcho.echo.phase,
    resonanceEcho.error,
    handleResonanceEchoStart,
  ]);

  const handleResonanceEchoComplete = useCallback(async () => {
    if (
      !authUid ||
      auth.currentUser?.uid !== authUid ||
      !canOfferResonanceEcho ||
      hasOtherResonanceSeat ||
      activeMatchInfo
    ) {
      return;
    }
    await progressionSyncQueueRef.current.catch(() => null);
    if (
      auth.currentUser?.uid !== authUid ||
      activeStationIdRef.current !== "resonance-duet"
    ) {
      return;
    }
    const result = await completeResonanceEchoWait();
    if (result?.progression) {
      progressionDirtyRef.current = false;
      progressionSyncSequenceRef.current += 1;
      setWorldProgression(hydrateWorldProgression(result.progression));
      setProgressionHydratedUid(authUid);
    }
    if (result?.error) {
      appendFeed(
        "The Echo could not confirm your route yet. Stay in the Garden and try again; nothing is lost.",
        "system",
      );
      return;
    }
    if (
      result?.applied ||
      result?.duplicate ||
      result?.alreadyCompleted ||
      result?.echo?.phase === "completed"
    ) {
      appendFeed(
        "The Echo tunes your rain prism. You receive identical quest credit without creating a shared encounter or Spark prompt.",
        "discovery",
      );
      handleLobbyCancel();
      setActiveLandmarkId(null);
    }
  }, [
    activeMatchInfo,
    appendFeed,
    authUid,
    canOfferResonanceEcho,
    completeResonanceEchoWait,
    handleLobbyCancel,
    hasOtherResonanceSeat,
  ]);
  const rendererQuestState = useMemo(() => {
    if (!primaryQuest || primaryQuest.status === "available") return null;
    const ready = primaryQuest.status === "ready-to-turn-in";
    const nodeId = ready
      ? `return-to-${primaryQuest.turnInNpcId}`
      : primaryQuest.currentObjectiveId;
    const turnInLandmarkId = ready
      ? NPCS[primaryQuest.turnInNpcId]?.homeLandmarkId
      : null;
    const expeditionLandmarkId =
      nodeId === "complete-expedition" &&
      lanternkeeperExpedition.personal.active
        ? {
            conservatory: "conservatory",
            market: "market",
            resonance: "resonance",
          }[lanternkeeperExpedition.expedition.phase] || "resonance"
        : null;
    const targetLandmarkId = ready
      ? turnInLandmarkId
      : expeditionLandmarkId || QUEST_OBJECTIVE_LANDMARKS[nodeId];
    if (!nodeId || !targetLandmarkId) return null;
    return {
      questId: primaryQuest.id,
      nodeId,
      targetLandmarkId,
      status: ready ? "ready-to-turn-in" : "active",
    };
  }, [
    lanternkeeperExpedition.expedition.phase,
    lanternkeeperExpedition.personal.active,
    primaryQuest,
  ]);
  const dialogueIndex = activeLandmarkId
    ? (memories[activeLandmarkId]?.lineIndex ?? -1)
    : -1;
  const dialogueExhausted = activeNpc
    ? dialogueIndex + 1 >= activeNpc.dialogue.length
    : false;
  const currentIntent = SESSION_INTENTS.find(
    (intent) => intent.id === sessionIntent,
  );
  const CurrentIntentIcon = currentIntent?.icon || Sparkles;
  const stationType = stationContext.stationType;
  const stationLandmark = stationContext.landmark;
  const stationActivity = stationContext.activity;
  const stationNpc = stationLandmark?.npcId
    ? NPCS[stationLandmark.npcId]
    : null;
  const socialMatchForView =
    stationMode === "social" && activeMatchInfo
      ? station.match?.id === activeMatchInfo.id
        ? station.match
        : activeMatchInfo
      : station.match || activeMatchInfo;
  const socialChoicesForView = useMemo(() => {
    if (stationMode !== "social" || !socialMatchForView?.id) return {};
    if (
      station.match?.id === socialMatchForView.id &&
      Object.keys(station.socialChoices || {}).length
    ) {
      return station.socialChoices;
    }
    if (Object.keys(activeMatchInfo?.socialChoices || {}).length) {
      return activeMatchInfo.socialChoices;
    }
    const outcome =
      socialRoundHandoff?.matchId === socialMatchForView.id
        ? socialRoundHandoff.outcome
        : null;
    if (!outcome) return {};
    return {
      [outcome.myUid]: {
        matchId: outcome.matchId,
        choiceId: outcome.myChoiceId,
        chosenAt: 0,
      },
      [outcome.opponentUid]: {
        matchId: outcome.matchId,
        choiceId: outcome.opponentChoiceId,
        chosenAt: 0,
      },
    };
  }, [
    activeMatchInfo?.socialChoices,
    socialMatchForView?.id,
    socialRoundHandoff,
    station.match?.id,
    station.socialChoices,
    stationMode,
  ]);
  const socialOutcomeForView = useMemo(
    () =>
      stationMode === "social"
        ? socialMomentOutcome(
            socialMatchForView,
            myUid,
            socialChoicesForView,
          )
        : null,
    [myUid, socialChoicesForView, socialMatchForView, stationMode],
  );
  const activityState = useMemo(() => {
    if (
      (stationType !== "listening-crescent" &&
        stationType !== "resonance-duet") ||
      !myUid ||
      !station.seats?.[myUid]
    )
      return null;

    const liveMatchIncludesMe = Boolean(
      station.match &&
        (station.match.white === myUid || station.match.black === myUid),
    );
    const matchedParticipants =
      liveMatchIncludesMe && station.match?.white && station.match?.black
        ? [station.match.white, station.match.black]
        : null;
    const queuedParticipants = Object.entries(station.seats || {})
      .map(([uid, seat]) => ({ uid, sitAt: seat?.sitAt || 0 }))
      .sort((first, second) => first.sitAt - second.sitAt)
      .slice(0, 2)
      .map((seat) => seat.uid);
    const participants = matchedParticipants || queuedParticipants;
    const slot = participants.indexOf(myUid);
    if (slot !== 0 && slot !== 1) return null;

    const hasMatch = Boolean(liveMatchIncludesMe && station.match?.id);
    const socialRoundResolved = Boolean(
      socialRoundHandoff?.matchId &&
        (socialRoundHandoff.matchId === activeMatchInfo?.id ||
          socialRoundHandoff.matchId === station.match?.id),
    );
    const phase =
      socialRoundResolved ||
      sharedAfterglow?.stationId === activeStationId
        ? "resolved"
        : hasMatch || activeMatchInfo
          ? "playing"
          : "waiting";

    return { id: stationType, active: true, slot, phase };
  }, [
    activeMatchInfo,
    activeStationId,
    myUid,
    sharedAfterglow,
    socialRoundHandoff?.matchId,
    station.match,
    station.seats,
    stationType,
  ]);
  const modalPhase = avatarStudioOpen
    ? "avatar-studio"
    : profileTarget
      ? `profile:${profileTarget.uid}`
      : showArrival
      ? "arrival"
      : activeStationId
      ? sharedAfterglow?.stationId === activeStationId
        ? `afterglow:${sharedAfterglow.matchId}`
        : npcChessActive
          ? "npc-chess"
          : activeMatchInfo
            ? `${stationMode}:${activeMatchInfo.id}`
            : `lobby:${activeStationId}`
        : activeLandmarkId
          ? `landmark:${activeLandmarkId}`
          : null;
  const hasWorldDialog = Boolean(modalPhase);

  useEffect(() => {
    const rememberWorldFocus = (event) => {
      if (!hasWorldDialog && event.target instanceof HTMLElement) {
        lastWorldFocusRef.current = event.target;
      }
    };
    document.addEventListener("focusin", rememberWorldFocus);
    return () => document.removeEventListener("focusin", rememberWorldFocus);
  }, [hasWorldDialog]);

  useEffect(() => {
    if (!hasWorldDialog) return undefined;
    modalRestoreFocusRef.current =
      lastWorldFocusRef.current || document.activeElement;
    return () => {
      const previous = modalRestoreFocusRef.current;
      modalRestoreFocusRef.current = null;
      if (
        previous?.isConnected &&
        typeof previous.focus === "function"
      ) {
        previous.focus();
      } else {
        document.querySelector(".world-stage")?.focus?.();
      }
    };
  }, [hasWorldDialog]);

  useEffect(() => {
    if (!modalPhase) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const panel = modalPhase.startsWith("profile:")
        ? document.querySelector(".world-profile-card__panel")
        : worldModalPanelRef.current;
      const target = panel?.querySelector(WORLD_DIALOG_FOCUSABLE);
      (target || panel)?.focus?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [modalPhase]);

  useEffect(() => {
    if (!modalPhase) return undefined;
    const keepFocusInDialog = (event) => {
      if (event.key !== "Tab") return;
      const panel = modalPhase.startsWith("profile:")
        ? document.querySelector(".world-profile-card__panel")
        : worldModalPanelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll(WORLD_DIALOG_FOCUSABLE),
      ).filter(
        (element) =>
          !element.hasAttribute("hidden") &&
          element.getAttribute("aria-hidden") !== "true",
      );
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = document.activeElement;
      if (event.shiftKey && (focused === first || !panel.contains(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !panel.contains(focused))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keepFocusInDialog);
    return () => document.removeEventListener("keydown", keepFocusInDialog);
  }, [modalPhase]);
  const worldSoundLabel =
    worldAudioState === "unsupported"
      ? "Sound unavailable"
      : !soundEnabled
        ? "Sound off"
        : worldAudioState === "locked"
          ? "Sound ready"
          : "Sound on";
  const worldSoundAriaLabel =
    worldAudioState === "unsupported"
      ? "World sound is unavailable"
      : !soundEnabled
        ? "Turn on world sound"
        : worldAudioState === "locked"
          ? "World sound is enabled. Focus or tap the world to start it. Press to turn world sound off."
          : "Turn off world sound";
  const worldSoundAnnouncement =
    worldAudioState === "running"
      ? "World sound on"
      : worldAudioState === "unsupported"
        ? "World sound unavailable"
        : soundEnabled
          ? "World sound ready. Focus or tap the world to start it."
          : "World sound off";
  const questDockStatus =
    primaryQuest?.status === "ready-to-turn-in"
      ? "Ready"
      : primaryQuest?.status === "active" && primaryObjective
        ? `${Math.max(
            1,
            primaryQuest.objectives.findIndex(
              (objective) => objective.id === primaryObjective.id,
            ) + 1,
          )}/${primaryQuest.objectives.length}`
        : primaryQuest?.status === "available"
          ? "New"
          : primaryQuest?.status === "completed"
            ? "Done"
            : "Explore";
  const relayDockStatus =
    rainlightRelay.event.phase === "completed" ||
    rainlightRelay.event.phase === "cooldown"
      ? "Complete"
      : `${rainlightRelay.event.contributionCount}/${rainlightRelay.event.targetCount}`;
  const partyIsActive = Boolean(lanternkeeperExpedition.personal?.active);
  const partyDockStatus = partyIsActive
    ? `${lanternkeeperExpedition.expedition.activeMemberCount}/${lanternkeeperExpedition.expedition.memberCapacity}`
    : lanternkeeperExpedition.expeditions.length
      ? `${lanternkeeperExpedition.expeditions.length} open`
      : "2–4";
  const initialActivityPanel = partyIsActive
    ? "party"
    : rainlightRelay.event.phase !== "idle"
      ? "relay"
      : "quest";

  return (
    <div className={`world-page${preview ? " world-page--preview" : ""}`}>
      <div
        className={`world-stage${preview ? " world-stage--preview" : ""}`}
        aria-hidden={hasWorldDialog ? "true" : undefined}
        inert={hasWorldDialog ? "" : undefined}
        tabIndex={-1}
      >
        {useNextWorld && !nextWorldFailed ? (
          <GameClientFrame
            controller={controller}
            profile={profile}
            remotePlayers={visibleRemotePlayers}
            audioEnabled={soundEnabled}
            paused={paused}
            onNearbyChange={handleNearbyChange}
            onPlayerSnapshot={handlePlayerSnapshot}
            onActionRequest={handleWorldAction}
            onExpeditionTargetChange={handleExpeditionTargetChange}
            onRemotePlayerClick={handleRemotePlayerClick}
            onAudioStateChange={setWorldAudioState}
            onFailure={handleNextWorldFailure}
            activityState={activityState}
            journeyState={rendererJourneyState}
            questState={rendererQuestState}
            publicEventState={rainlightRelay.event}
            expeditionState={lanternkeeperExpedition.rendererState}
          />
        ) : (
          <HubWorldScene
            controller={controller}
            playerStateRef={playerStateRef}
            onNearbyChange={handleNearbyChange}
            onPlayerSnapshot={handlePlayerSnapshot}
            nearbyLandmarkId={nearbyId}
            focusedLandmarkId={activeLandmarkId}
            paused={paused}
            avatarColor={avatarColor}
            avatarAppearance={avatarAppearance}
            remotePlayers={visibleRemotePlayers}
            onRemotePlayerClick={handleRemotePlayerClick}
            extrasRef={extrasRef}
          />
        )}

        {!showArrival && (
          <div className="world-topbar world-topbar--afterlight">
            <div className="world-topbar__identity">
              <div className="world-wordmark">
                <span className="world-wordmark__city">Afterlight</span>
                <span className="world-wordmark__district">
                  {WORLD_ROUTE_NAME}
                </span>
              </div>
              <button
                type="button"
                className="world-intent-chip"
                onClick={() => {
                  setArrivalChoice(sessionIntent || "meet");
                  setShowArrival(true);
                }}
                title="Change tonight's intention"
              >
                <span className="world-intent-chip__glyph">
                  <CurrentIntentIcon aria-hidden="true" />
                </span>
                <span>{currentIntent?.eyebrow || "Set your pace"}</span>
              </button>
            </div>
            <div className="world-topbar__actions">
              {useNextWorld && !nextWorldFailed && (
                <button
                  type="button"
                  className={`world-sound-toggle is-${worldAudioState}`}
                  aria-label={worldSoundAriaLabel}
                  aria-pressed={soundEnabled}
                  disabled={worldAudioState === "unsupported"}
                  onClick={toggleWorldSound}
                  title={worldSoundAriaLabel}
                >
                  <span
                    className="world-sound-toggle__signal"
                    aria-hidden="true"
                  />
                  <span className="world-sound-toggle__label">
                    {worldSoundLabel}
                  </span>
                  <span
                    className="world-sound-toggle__compact"
                    aria-hidden="true"
                  >
                    Sound
                  </span>
                </button>
              )}
              <button
                type="button"
                className="world-avatar-chip"
                style={{ "--chip-color": avatarColor }}
                onClick={() => setAvatarStudioOpen(true)}
                aria-label={`Customize ${playerName}'s avatar`}
              >
                <span className="world-avatar-chip__dot" />
                <span className="world-avatar-chip__name">{playerName}</span>
                <span className="world-avatar-chip__edit" aria-hidden="true">
                  Edit
                </span>
              </button>
              <div
                className="world-online-chip"
                aria-label={`${visibleRemotePlayers.length} other people nearby`}
              >
                <span className="world-online-chip__pulse" />
                {visibleRemotePlayers.length} nearby
              </div>
              <button
                type="button"
                className="world-quiet-exit"
                onClick={leaveQuietly}
              >
                Leave quietly
              </button>
            </div>
          </div>
        )}
        {useNextWorld && !nextWorldFailed && (
          <span className="world-visually-hidden" role="status" aria-live="polite">
            {worldSoundAnnouncement}
          </span>
        )}

        {!showArrival && (
          <div className="world-objective-hud world-objective-hud--activity-dock">
            <WorldActivityDock
              questStatus={questDockStatus}
              relayStatus={relayDockStatus}
              partyStatus={partyDockStatus}
              initialPanel={initialActivityPanel}
              questContent={
                <QuestTracker
              level={levelProgress.level}
              xpIntoLevel={levelProgress.xpIntoLevel}
              xpNeededForNextLevel={levelProgress.xpForNextLevel || 1}
              quest={
                primaryQuest
                  ? {
                      id: primaryQuest.id,
                      title: primaryQuest.title,
                      description: primaryQuest.summary,
                      status: primaryQuest.status,
                    }
                  : null
              }
              objective={
                primaryObjective
                  ? {
                      label: primaryObjective.label,
                      detail: primaryObjective.detail,
                      position:
                        primaryQuest.objectives.findIndex(
                          (objective) => objective.id === primaryObjective.id,
                        ) + 2,
                      total: primaryQuest.objectives.length + 2,
                    }
                  : primaryQuest?.status === "ready-to-turn-in"
                    ? {
                        label: `Return to ${primaryTurnInNpc?.name || "the quest giver"}${primaryTurnInLandmark ? ` at ${primaryTurnInLandmark.name}` : ""}`,
                        detail: "Turn in the completed quest and claim your reward.",
                        position: primaryQuest.objectives.length + 2,
                        total: primaryQuest.objectives.length + 2,
                      }
                    : primaryQuest?.status === "available"
                      ? {
                          label: `Talk to ${primaryGiverNpc?.name || "the quest giver"}${primaryGiverLandmark ? ` at ${primaryGiverLandmark.name}` : ""}`,
                          detail: "Quest-givers begin authored storylines in the world.",
                          position: 1,
                          total: primaryQuest.objectives.length + 2,
                        }
                    : null
              }
              reward={
                primaryQuest
                  ? {
                      xp: primaryQuest.rewards.xp,
                      cosmeticLabels: primaryQuest.rewards.cosmetics.map(
                        (cosmetic) => cosmetic.name,
                      ),
                    }
                  : null
              }
                />
              }
              relayContent={
                <RainlightRelayCard
                  event={rainlightRelay.event}
                  personal={rainlightRelay.personal}
                  nearbySourceId={nearbyId}
                  echoSecondsRemaining={
                    rainlightRelay.echoSecondsRemaining
                  }
                  canContribute={rainlightRelay.canContribute}
                  busySourceId={rainlightRelay.busySourceId}
                  signedIn={Boolean(authUid)}
                  error={rainlightRelay.error}
                  onContribute={handleRainlightContribute}
                  onSignIn={navigateToLogin}
                />
              }
              partyContent={
                <LanternkeeperExpeditionCard
                  expeditions={lanternkeeperExpedition.expeditions}
                  expedition={lanternkeeperExpedition.expedition}
                  personal={lanternkeeperExpedition.personal}
                  completedTargetIds={
                    lanternkeeperExpedition.completedTargetIds
                  }
                  currentTargets={lanternkeeperExpedition.currentTargets}
                  availableTargetIds={
                    lanternkeeperExpedition.availableTargets
                  }
                  nearbyTargetId={nearbyExpeditionTarget}
                  canUseEcho={lanternkeeperExpedition.canUseEcho}
                  echoAvailableAt={
                    lanternkeeperExpedition.expedition.echoAvailableAt
                  }
                  expiresAt={lanternkeeperExpedition.expedition.expiresAt}
                  serverTimeOffset={lanternkeeperExpedition.serverTimeOffset}
                  busyAction={lanternkeeperExpedition.busyAction}
                  signedIn={Boolean(authUid)}
                  rewardReady={
                    lanternkeeperQuestProgress?.status === "ready-to-turn-in"
                  }
                  atBoard={nearbyId === "resonance"}
                  error={lanternkeeperExpedition.error}
                  onStart={handleLanternkeeperStart}
                  onJoin={handleLanternkeeperJoin}
                  onLeave={handleLanternkeeperLeave}
                  onContribute={handleLanternkeeperContribute}
                  onSignIn={navigateToLogin}
                />
              }
            />
            <details className="world-side-thread">
              <summary>Tonight's side thread</summary>
              <NightJourneyCard
            city={DISTRICT.city}
            event={DISTRICT.event}
            eventTime={DISTRICT.eventTime}
            weather={DISTRICT.weather}
            journey={nightJourney}
            progress={journeyProgress}
            keepsakeCount={nightKeepsakes.length}
            sharedMomentCount={sharedMomentReceipts.length}
            controlsHint={
              isTouch
                ? "Move pad · drag to look · tap to approach"
                : "WASD · E interact · Q emote · T talk"
            }
                onRestart={restartNightJourney}
              />
            </details>
          </div>
        )}

        <div className="world-feed" aria-live="polite">
          {feed.slice(-5).map((entry) => (
            <div
              key={entry.id}
              className={`world-feed__row world-feed__row--${entry.tone}`}
            >
              {entry.text}
            </div>
          ))}
        </div>

        {nearbyExpeditionTarget &&
          lanternkeeperExpedition.availableTargets.includes(
            nearbyExpeditionTarget,
          ) &&
          !activeLandmarkId &&
          !activeStationId &&
          !profileTarget && (
            <div className="world-prompt world-prompt--expedition">
              <button
                type="button"
                className="world-prompt__btn"
                disabled={Boolean(lanternkeeperExpedition.busyAction)}
                onClick={() =>
                  handleLanternkeeperContribute(nearbyExpeditionTarget)
                }
              >
                <span className="world-prompt__key">
                  {isTouch ? "Tap" : "E"}
                </span>
                <span className="world-prompt__text">
                  {lanternkeeperExpedition.busyAction?.startsWith(
                    "contribute:",
                  )
                    ? "Attuning field marker…"
                    : "Attune Lanternkeeper field marker"}
                </span>
              </button>
            </div>
          )}

        {nearbyLandmark &&
          !(
            nearbyExpeditionTarget &&
            lanternkeeperExpedition.availableTargets.includes(
              nearbyExpeditionTarget,
            )
          ) &&
          !activeLandmarkId &&
          !activeStationId &&
          !profileTarget && (
            <div className="world-prompt">
              <button
                type="button"
                className="world-prompt__btn"
                onClick={() => openLandmark(nearbyLandmark.id)}
              >
                <span className="world-prompt__key">
                  {isTouch ? "Tap" : "E"}
                </span>
                <span className="world-prompt__text">
                  {nearbyLandmark.npcId
                    ? `Talk to ${NPCS[nearbyLandmark.npcId].name}`
                    : `Visit ${nearbyLandmark.name}`}
                </span>
              </button>
            </div>
          )}

        {pendingWaveSignal && (
          <div
            className="world-toast"
            onAnimationEnd={() => setPendingWaveSignal(null)}
          >
            <Hand aria-hidden="true" />
            <span>
              {pendingWaveSignal.fromName || "Someone"} is open to saying hello
            </span>
          </div>
        )}

        {pendingInviteSignal && !showArrival && (
          <div className="world-invite-card" role="status">
            <div className="world-invite-card__eyebrow">Game invitation</div>
            <div className="world-invite-card__title">
              {pendingInviteSignal.fromName || "Someone"} wants to share a quick
              two-person game.
            </div>
            <div className="world-invite-card__actions">
              <button type="button" onClick={() => respondToInvite(false)}>
                Not now
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => respondToInvite(true)}
              >
                Join them
              </button>
            </div>
          </div>
        )}

        {isTouch && !paused && <Joystick controller={controller} />}

        {/* Quick action buttons for emote + chat (always visible) */}
        {!paused && !activeStationId && !profileTarget && (
          <div className="world-quick-actions">
            <button
              type="button"
              className="world-quick-actions__btn"
              onClick={() => setEmoteOpen(true)}
              aria-label="Emotes"
              title="Emotes (Q)"
            >
              <Smile aria-hidden="true" />
            </button>
            <button
              type="button"
              className="world-quick-actions__btn"
              onClick={() => setChatOpen(true)}
              aria-label="Say something"
              title="Say something (T)"
            >
              <MessageCircle aria-hidden="true" />
            </button>
          </div>
        )}

        <ChatInput
          open={chatOpen}
          onSend={handleSayMessage}
          onClose={() => setChatOpen(false)}
        />
      </div>

      {showArrival && (
        <div
          className="world-arrival"
          role="dialog"
          aria-modal="true"
          aria-labelledby="afterlight-arrival-title"
        >
          <div className="world-arrival__veil" aria-hidden="true" />
          <div
            ref={worldModalPanelRef}
            className="world-arrival__panel"
            tabIndex={-1}
          >
            {sessionIntent && (
              <button
                type="button"
                className="world-arrival__close"
                onClick={() => setShowArrival(false)}
                aria-label="Return to the district"
              >
                <X aria-hidden="true" />
              </button>
            )}
            <div className="world-arrival__brand">
              <span>Datescape presents</span>
              <strong>Afterlight</strong>
            </div>
            <div className="world-arrival__copy">
              <div className="world-arrival__eyebrow">
                Arrival Conservatory · {WORLD_ROUTE_NAME}
              </div>
              <h1 id="afterlight-arrival-title">
                What kind of night do you want?
              </h1>
              <p>
                Your choice tells people how to approach. It never commits you
                to a conversation.
              </p>
            </div>

            <div className="world-arrival__intent-grid">
              {SESSION_INTENTS.map((intent) => {
                const IntentIcon = intent.icon;
                return (
                  <button
                    key={intent.id}
                    type="button"
                    className={`world-arrival__intent${arrivalChoice === intent.id ? " is-selected" : ""}`}
                    onClick={() => setArrivalChoice(intent.id)}
                    aria-pressed={arrivalChoice === intent.id}
                  >
                    <span className="world-arrival__intent-glyph">
                      <IntentIcon aria-hidden="true" />
                    </span>
                    <span className="world-arrival__intent-copy">
                      <small>{intent.eyebrow}</small>
                      <strong>{intent.title}</strong>
                      <span>{intent.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="world-arrival__footer">
              <div className="world-arrival__avatar">
                <span className="world-arrival__avatar-label">Your light</span>
                <div className="world-arrival__palette">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={color === avatarColor ? "is-active" : ""}
                      style={{ "--arrival-color": color }}
                      onClick={() => setAvatarColor(color)}
                      aria-label={`Use avatar light ${color}`}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="world-arrival__enter"
                onClick={enterWorld}
              >
                Enter Afterlight Shore
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
            <div className="world-arrival__safety">
              <span>Approaches require consent.</span>
              <span>Mute, block, report, or leave quietly at any time.</span>
            </div>
          </div>
        </div>
      )}

      <EmoteWheel
        open={emoteOpen}
        onPick={handleEmote}
        onClose={() => setEmoteOpen(false)}
      />

      {avatarStudioOpen && (
        <div
          className="world-modal world-modal--avatar-studio"
          role="dialog"
          aria-modal="true"
          aria-label="Avatar studio"
        >
          <div
            className="world-modal__backdrop"
            onClick={() => setAvatarStudioOpen(false)}
          />
          <div
            ref={worldModalPanelRef}
            className="world-modal__panel world-modal__panel--avatar-studio"
            tabIndex={-1}
          >
            <AvatarStudio
              appearance={avatarAppearance}
              unlockedCosmetics={worldProgression.unlockedCosmetics}
              onSave={handleAvatarSave}
              onCancel={() => setAvatarStudioOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Landmark/dialogue modal */}
      {activeLandmark && !activeStationId && (
        <div
          className="world-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="world-landmark-dialog-title"
        >
          <div className="world-modal__backdrop" onClick={closeLandmark} />
          <div
            ref={worldModalPanelRef}
            className="world-modal__panel"
            tabIndex={-1}
          >
            <div className="world-modal__header">
              <div>
                <div className="world-modal__eyebrow">
                  {activeNpc?.role || "Place"}
                </div>
                <div
                  id="world-landmark-dialog-title"
                  className="world-modal__title"
                >
                  {activeNpc ? activeNpc.name : activeLandmark.name}
                </div>
                <div className="world-modal__subtitle">
                  {activeLandmark.name}
                </div>
              </div>
              <button
                type="button"
                className="world-modal__close"
                onClick={closeLandmark}
                aria-label="Close"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <p className="world-modal__blurb">
              {dialogueIndex >= 0 && activeNpc
                ? activeNpc.dialogue[dialogueIndex]
                : activeNpc?.greeting || activeLandmark.blurb}
            </p>

            <div className="world-modal__actions">
              {activeNpcQuest && (
                <button
                  type="button"
                  className="world-modal__action world-modal__action--quest"
                  disabled={activeNpcQuest.status === "active"}
                  onClick={() =>
                    activeNpcQuest.status === "ready-to-turn-in"
                      ? handleQuestTurnIn(activeNpcQuest.id)
                      : handleQuestAccept(activeNpcQuest.id)
                  }
                >
                  <span className="world-modal__action-label">
                    {activeNpcQuest.status === "ready-to-turn-in"
                      ? `Turn in: ${activeNpcQuest.title}`
                      : activeNpcQuest.status === "active"
                        ? `Quest underway: ${activeNpcQuest.title}`
                        : `Accept quest: ${activeNpcQuest.title}`}
                  </span>
                  <span className="world-modal__action-desc">
                    {activeNpcQuest.status === "ready-to-turn-in"
                      ? `Claim ${activeNpcQuest.rewards.xp} XP and ${activeNpcQuest.rewards.cosmetics[0]?.name || "a cosmetic reward"}.`
                      : activeNpcQuest.status === "active"
                        ? activeNpcQuest.objectives.find(
                            (objective) =>
                              objective.id === activeNpcQuest.currentObjectiveId,
                          )?.label || "Follow the active objective in your quest log."
                        : activeNpcQuest.summary}
                  </span>
                </button>
              )}

              {activeNpc && (
                <button
                  type="button"
                  className="world-modal__action world-modal__action--talk"
                  onClick={() => advanceDialogue(activeLandmark.id)}
                >
                  <span className="world-modal__action-label">
                    {dialogueExhausted
                      ? "Wave goodbye"
                      : dialogueIndex < 0
                        ? "Say hi"
                        : "Continue"}
                  </span>
                  {!dialogueExhausted && (
                    <span className="world-modal__action-desc">
                      {dialogueIndex + 1 < activeNpc.dialogue.length - 1
                        ? "Hear them out."
                        : "One more thing on their mind."}
                    </span>
                  )}
                </button>
              )}

              {activeLandmark.activities.map((activity) => {
                const oneShotConsumed =
                  activity.kind === "oneShot" &&
                  memories[activeLandmark.id]?.consumed?.[activity.id] ===
                    nightJourney.id;
                const activityQuest =
                  activity.kind === "quest" && activity.questId
                    ? selectQuestProgress(worldProgression, activity.questId)
                    : null;
                const questObjective =
                  activityQuest
                    ? activityQuest.objectives.find(
                        (objective) => objective.id === activity.objectiveId,
                      )
                    : null;
                const questActivityAvailable = Boolean(
                  activity.kind !== "quest" ||
                    (activityQuest?.status === "active" &&
                      questObjective?.status === "current"),
                );
                const questActivityCompleted = Boolean(
                  activity.kind === "quest" && questObjective?.complete,
                );
                const publicEventAvailable = Boolean(
                  activity.kind !== "publicEvent" ||
                    (rainlightRelay.canContribute &&
                      (rainlightRelay.event.phase === "idle" ||
                        rainlightRelay.personal.availableSources.includes(
                          activity.sourceId,
                        ))),
                );
                const consumed =
                  oneShotConsumed ||
                  questActivityCompleted ||
                  !questActivityAvailable ||
                  !publicEventAvailable;
                const accountRequired =
                  (activity.kind === "social" ||
                    activity.kind === "cooperative" ||
                    activity.kind === "publicEvent" ||
                    activity.kind === "expedition") &&
                  !myUid;
                return (
                  <button
                    key={activity.id}
                    type="button"
                    className={`world-modal__action${consumed ? " is-disabled" : ""}`}
                    disabled={consumed}
                    onClick={() =>
                      accountRequired
                        ? navigate("/login")
                        : performActivity(activeLandmark.id, activity)
                    }
                  >
                    <span className="world-modal__action-label">
                      {accountRequired
                        ? `Sign in to join ${activity.stationName || "this activity"}`
                        : questActivityCompleted
                          ? `${activity.label} complete`
                          : activity.kind === "quest" && !questActivityAvailable
                            ? activityQuest?.status === "available"
                              ? `Ask ${NPCS[activityQuest.giverNpcId]?.name || "the quest giver"} about ${activityQuest.title} first`
                              : "Follow the earlier quest objective first"
                        : activity.kind === "publicEvent" && !publicEventAvailable
                          ? rainlightRelay.event.phase === "completed" ||
                            rainlightRelay.event.phase === "cooldown"
                            ? "Rainlight Relay complete"
                            : rainlightRelay.personal.contributedSources.includes(
                                  activity.sourceId,
                                )
                              ? "Your light is banked here"
                              : "Your route is banked this round"
                        : oneShotConsumed
                          ? `Already ${activity.label.toLowerCase()}`
                          : activity.label}
                    </span>
                    <span className="world-modal__action-desc">
                      {accountRequired
                        ? "DateScape accounts keep real-person activities private and consent-based."
                        : activity.kind === "quest" && !questActivityAvailable
                          ? `This discovery belongs to ${activityQuest?.title || "an active quest"}.`
                        : activity.kind === "publicEvent" && !publicEventAvailable
                          ? "Keep exploring while the shared Relay carries this light."
                        : activity.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Station: lobby OR active chess game */}
      {activeStationId && (
        <div
          className={`world-modal${stationMode === "resonance" ? " world-modal--resonance" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="World activity"
        >
          <div
            className="world-modal__backdrop"
            onClick={
              sharedAfterglow?.stationId === activeStationId
                ? handleAfterglowReturn
                : stationMode !== "chess" && activeMatchInfo
                ? handleConsentActivityLeave
                : handleLobbyCancel
            }
          />
          <div
            ref={worldModalPanelRef}
            className="world-modal__panel"
            tabIndex={-1}
          >
            {sharedAfterglow?.stationId === activeStationId ? (
              <SharedMomentAfterglow
                mode={sharedAfterglow.mode}
                opponent={sharedAfterglow.opponent}
                prompt={sharedAfterglow.prompt}
                ready={sharedAfterglow.ready}
                busyLabel={
                  sharedAfterglow.requeueing
                    ? "Opening a fresh place in the queue…"
                    : undefined
                }
                onReturn={handleAfterglowReturn}
                onReplay={handleAfterglowReplay}
                onViewProfile={handleAfterglowViewProfile}
                encounter={verifiedAfterglowEncounter}
                encounterLoading={Boolean(
                  (sharedAfterglow.mode === "resonance" ||
                    sharedAfterglow.mode === "social") &&
                    sharedAfterglow.ready &&
                    !verifiedAfterglowEncounter &&
                    !sharedAfterglow.encounterUnavailable
                )}
                encounterBusy={
                  sharedEncounters.busyEncounterId ===
                  verifiedAfterglowEncounter?.id
                }
                encounterError={
                  sharedEncounters.error ||
                  (sharedAfterglow.encounterUnavailable
                    ? "Private continuation choices are unavailable right now."
                    : null)
                }
                onSpark={handleAfterglowSpark}
                onPass={handleAfterglowPass}
              />
            ) : !activeMatchInfo && !npcChessActive ? (
              <StationLobby
                stationName={
                  stationActivity?.stationName ||
                  stationLandmark?.name ||
                  "Station"
                }
                mode={stationMode}
                npcName={stationNpc?.name}
                myUid={myUid}
                seats={station.seats}
                match={station.match}
                onCancel={handleLobbyCancel}
                onPlayNpc={handleLobbyPlayNpc}
                onMatchReady={handleLobbyMatchReady}
                echoAvailableAt={
                  canOfferResonanceEcho &&
                  resonanceEcho.echo.phase !== "completed"
                    ? resonanceEcho.echo.maturesAt
                    : null
                }
                echoServerNow={resonanceEcho.echo.serverNow}
                echoBusy={resonanceEcho.busy}
                echoError={resonanceEcho.error}
                error={station.error}
                onEcho={
                  canOfferResonanceEcho
                    ? handleResonanceEchoComplete
                    : undefined
                }
                onEchoRetry={
                  canOfferResonanceEcho &&
                  resonanceEcho.echo.phase === "idle" &&
                  resonanceEcho.error
                    ? handleResonanceEchoStart
                    : undefined
                }
              />
            ) : npcChessActive ? (
              <ChessGame
                npcName={stationNpc?.name || "Mira"}
                onClose={handleLobbyCancel}
                onResult={handleChessResult}
              />
            ) : stationMode === "resonance" ? (
              <ResonanceDuet
                match={station.match || activeMatchInfo}
                myUid={myUid}
                soundEnabled={soundEnabled}
                onPulse={handleResonancePulse}
                onResolved={handleResonanceResolved}
                onLeave={handleConsentActivityLeave}
              />
            ) : stationMode === "social" ? (
              <SocialMoment
                match={socialMatchForView}
                myUid={myUid}
                choices={socialChoicesForView}
                partnerLeft={
                  !station.match ||
                  station.match.id !== socialMatchForView?.id
                }
                onChoose={submitSocialChoice}
                onResolved={handleSocialMomentResolved}
                onComplete={handleSocialMomentComplete}
                onReplay={handleSocialMomentReplay}
                handoffBusy={Boolean(
                  socialReplayRequest ||
                    (socialOutcomeForView &&
                      (socialRoundHandoff?.matchId !==
                        socialOutcomeForView.matchId ||
                        !socialRoundHandoff.ready)),
                )}
                handoffError={Boolean(
                  socialRoundHandoff?.matchId ===
                    socialOutcomeForView?.matchId &&
                    socialRoundHandoff.ackError,
                )}
                onRetryHandoff={handleSocialHandoffRetry}
                onLeave={handleConsentActivityLeave}
              />
            ) : (
              <ChessGame
                onClose={handleLobbyCancel}
                onResult={handleChessResult}
                multiplayer={{
                  myUid,
                  matchId: activeMatchInfo.id,
                  whiteUid: activeMatchInfo.white,
                  blackUid: activeMatchInfo.black,
                  whiteName: activeMatchInfo.whiteName,
                  blackName: activeMatchInfo.blackName,
                  moves: matchMoves,
                  submitMove: station.submitMove,
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Profile reveal */}
      {profileTarget && (
        <ProfileCard
          uid={profileTarget.uid}
          name={profileTarget.name}
          color={profileTarget.color}
          intent={profileTarget.intent}
          mutual={Boolean(mutualMatches[profileTarget.uid])}
          onClose={() => setProfileTarget(null)}
          onWave={handleWave}
          onInvite={handleInviteChess}
          onMute={handleMutePlayer}
          onBlock={handleBlockPlayer}
          onReport={handleReportPlayer}
          onOpenConnection={() => {
            const matchId = mutualMatches[profileTarget.uid];
            if (matchId) navigate(`/app/chat/${matchId}`);
          }}
        />
      )}
    </div>
  );
}
