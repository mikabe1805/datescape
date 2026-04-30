import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HubWorldScene from "../game/HubWorldScene";
import { useMovementController, useKeyboardBindings } from "../game/useMovement";
import { LANDMARKS, NPCS, levelForXp } from "../game/worldData";
import { usePresence } from "../game/usePresence";
import { useStation, useMatchMoves, useSignals, sendSignal, recordWorldLike } from "../game/useStation";
import { promoteWorldLikeToMatch } from "../game/matchBridge";
import Joystick from "./world/Joystick";
import ChessGame from "./world/ChessGame";
import ProfileCard from "./world/ProfileCard";
import StationLobby from "./world/StationLobby";
import EmoteWheel from "./world/EmoteWheel";
import ChatInput from "./world/ChatInput";
import { auth, db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";
import "../css/world.css";

const COLOR_OPTIONS = ["#f5c973", "#8ad6c6", "#f19bb8", "#99b4ff", "#d9b0ff"];
const STORAGE_PREFIX = "datescape:world:v5:";
const FEED_LIMIT = 18;
const ROOM_ID = "ember-plaza";

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
  return (u?.displayName || u?.email?.split("@")[0] || "Wayfarer").slice(0, 22);
}

function makeFeedEntry(text, tone = "info") {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    tone,
    at: Date.now(),
  };
}

export default function WorldPage() {
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
  const [avatarColor, setAvatarColor] = useState(initial?.avatarColor || COLOR_OPTIONS[0]);
  const [playerName, setPlayerName] = useState(() => initial?.playerName || defaultName());
  const [feed, setFeed] = useState(
    () => initial?.feed || [makeFeedEntry("You step into Ember Plaza.", "system")]
  );
  const [memories, setMemories] = useState(() => initial?.memories || {});
  const [chessRecord, setChessRecord] = useState(
    () => initial?.chessRecord || { wins: 0, losses: 0, draws: 0 }
  );
  const [xp, setXp] = useState(() => initial?.xp || 0);
  const [worldLikes, setWorldLikes] = useState(() => initial?.worldLikes || {});

  // When the logged-in user changes, reload the world state from their slice.
  const lastHydratedUidRef = useRef(authUid);
  useEffect(() => {
    if (lastHydratedUidRef.current === authUid) return;
    lastHydratedUidRef.current = authUid;
    const slice = loadState(authUid);
    setAvatarColor(slice?.avatarColor || COLOR_OPTIONS[0]);
    setPlayerName(slice?.playerName || defaultName());
    setFeed(slice?.feed || [makeFeedEntry("You step into Ember Plaza.", "system")]);
    setMemories(slice?.memories || {});
    setChessRecord(slice?.chessRecord || { wins: 0, losses: 0, draws: 0 });
    setXp(slice?.xp || 0);
    setWorldLikes(slice?.worldLikes || {});
  }, [authUid]);

  const [nearbyId, setNearbyId] = useState(null);
  const [activeLandmarkId, setActiveLandmarkId] = useState(null);
  const [paused, setPaused] = useState(false);

  // Stations / lobby state
  const [activeStationId, setActiveStationId] = useState(null);
  const [activeMatchInfo, setActiveMatchInfo] = useState(null); // when game in progress
  const [npcChessActive, setNpcChessActive] = useState(false);

  // Profile card for tapped remote player
  const [profileTarget, setProfileTarget] = useState(null); // { uid, name, color }

  const [, setSnapshotTick] = useState(0);
  const playerStateRef = useRef({ x: 0, z: 6, heading: 0, speed: 0 });
  const snapshotRef = useRef(playerStateRef.current);
  const extrasRef = useRef({});

  const [emoteOpen, setEmoteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const controller = useMovementController();
  const isTouch = useIsTouch();
  useKeyboardBindings(controller, { enabled: !paused });

  const profile = useMemo(
    () => ({ name: playerName, color: avatarColor }),
    [playerName, avatarColor]
  );

  // Multiplayer presence
  const { remotePlayers, myUid } = usePresence({
    snapshotRef,
    extrasRef,
    profile,
    enabled: true,
    currentRoom: ROOM_ID,
  });

  // Persist avatar color to the user's Firestore doc so it follows them across the app.
  useEffect(() => {
    if (!myUid) return;
    setDoc(
      doc(db, "users", myUid),
      { worldProfile: { color: avatarColor, lastSeen: Date.now() } },
      { merge: true }
    ).catch(() => {});
  }, [myUid, avatarColor]);

  // Station hook (only active when sitting)
  const station = useStation({
    stationId: activeStationId,
    room: ROOM_ID,
    profile,
    enabled: Boolean(activeStationId),
  });

  // Subscribe to chess match moves only while a match is active
  const matchPath = activeStationId && station.match?.id
    ? `stations/${ROOM_ID}/${activeStationId}/match`
    : null;
  const matchMoves = useMatchMoves(matchPath, Boolean(matchPath));

  // Incoming signals (waves, mutual likes, invites)
  const { signals, consume: consumeSignal } = useSignals({ enabled: true });
  const [pendingWaveSignal, setPendingWaveSignal] = useState(null);

  useEffect(() => {
    if (!signals.length) return;
    const next = signals[signals.length - 1];
    if (!next) return;
    if (next.type === "wave") {
      setPendingWaveSignal(next);
      appendFeedRef.current?.(`${next.fromName || "Someone"} waves at you.`, "discovery");
    } else if (next.type === "like-mutual") {
      appendFeedRef.current?.(`It's a match with ${next.fromName}!`, "discovery");
      if (myUid && next.fromUid) {
        promoteWorldLikeToMatch({ fromUid: myUid, toUid: next.fromUid });
      }
    } else if (next.type === "invite-chess") {
      appendFeedRef.current?.(`${next.fromName} invited you to play chess.`, "discovery");
    }
    consumeSignal(next.key);
  }, [signals, consumeSignal, myUid]);

  const appendFeedRef = useRef(null);
  const appendFeed = useCallback((text, tone = "info") => {
    setFeed((prev) => [...prev.slice(-(FEED_LIMIT - 1)), makeFeedEntry(text, tone)]);
  }, []);
  appendFeedRef.current = appendFeed;

  const grantXp = useCallback(
    (amount, label) => {
      if (amount <= 0) return;
      setXp((current) => {
        const before = levelForXp(current);
        const after = levelForXp(current + amount);
        if (after.level > before.level) {
          appendFeedRef.current?.(`You reached level ${after.level}.`, "discovery");
        }
        return current + amount;
      });
      if (label) appendFeedRef.current?.(`+${amount} XP — ${label}`, "system");
    },
    []
  );

  // Persist (per-user)
  useEffect(() => {
    saveState(authUid, {
      avatarColor,
      playerName,
      feed: feed.slice(-FEED_LIMIT),
      memories,
      chessRecord,
      xp,
      worldLikes,
    });
  }, [authUid, avatarColor, playerName, feed, memories, chessRecord, xp, worldLikes]);

  const handleNearbyChange = useCallback(
    (id) => {
      setNearbyId(id);
      if (id && !memories[id]?.discovered) {
        const lm = LANDMARKS.find((l) => l.id === id);
        if (lm) {
          appendFeed(`You find your way to ${lm.name}.`, "discovery");
          grantXp(10, `discovered ${lm.name}`);
          setMemories((m) => ({ ...m, [id]: { ...(m[id] || {}), discovered: true } }));
        }
      }
    },
    [memories, appendFeed, grantXp]
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
    [appendFeed]
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
        setMemories((m) => ({
          ...m,
          [landmarkId]: { ...(m[landmarkId] || {}), discovered: true, lineIndex: -1 },
        }));
        closeLandmark();
        return;
      }
      const line = npc.dialogue[nextIndex];
      appendFeed(`${npc.name}: ${line}`, "dialog");
      grantXp(2, `talked to ${npc.name}`);
      setMemories((m) => ({
        ...m,
        [landmarkId]: { ...(m[landmarkId] || {}), discovered: true, lineIndex: nextIndex },
      }));
    },
    [memories, appendFeed, closeLandmark, grantXp]
  );

  const performActivity = useCallback(
    (landmarkId, activity) => {
      if (activity.kind === "minigame") {
        // Open the lobby for this station.
        setActiveStationId(activity.stationId);
        return;
      }
      if (activity.kind === "oneShot") {
        const consumed = memories[landmarkId]?.consumed?.[activity.id];
        if (consumed) return;
        appendFeed(activity.response, "dialog");
        if (activity.xp) grantXp(activity.xp, activity.label.toLowerCase());
        setMemories((m) => ({
          ...m,
          [landmarkId]: {
            ...(m[landmarkId] || {}),
            discovered: true,
            consumed: { ...(m[landmarkId]?.consumed || {}), [activity.id]: true },
          },
        }));
      }
    },
    [memories, appendFeed, grantXp]
  );

  // --- Station lobby flows ---
  useEffect(() => {
    if (!activeStationId) return undefined;
    // Sit when entering lobby. Stand when leaving.
    station.sit();
    return () => {
      station.stand();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStationId]);

  const handleLobbyMatchReady = useCallback(
    (match) => {
      if (activeMatchInfo?.id === match.id) return;
      setActiveMatchInfo(match);
      const opponent = match.white === myUid ? match.blackName : match.whiteName;
      appendFeed(`Match started against ${opponent || "another player"}.`, "discovery");
    },
    [activeMatchInfo, myUid, appendFeed]
  );

  const handleLobbyCancel = useCallback(() => {
    setActiveStationId(null);
    setActiveMatchInfo(null);
    setNpcChessActive(false);
  }, []);

  const handleLobbyPlayNpc = useCallback(() => {
    setNpcChessActive(true);
  }, []);

  const handleChessResult = useCallback(
    (result) => {
      setChessRecord((r) => ({
        wins: r.wins + (result === "win" ? 1 : 0),
        losses: r.losses + (result === "loss" ? 1 : 0),
        draws: r.draws + (result === "draw" ? 1 : 0),
      }));
      const xpGain = result === "win" ? 30 : result === "draw" ? 15 : 8;
      grantXp(xpGain, `chess ${result}`);
    },
    [grantXp]
  );

  // ESC closes everything
  useEffect(() => {
    if (!paused && !activeStationId && !profileTarget) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (activeStationId) {
        handleLobbyCancel();
      } else if (profileTarget) {
        setProfileTarget(null);
      } else {
        closeLandmark();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, activeStationId, profileTarget, closeLandmark, handleLobbyCancel]);

  // E to interact, Q to emote, T to chat — only when not in a modal/lobby
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (paused || activeStationId) return;
      if (e.code === "KeyE" && nearbyId) {
        openLandmark(nearbyId);
      } else if (e.code === "KeyQ" && !emoteOpen && !chatOpen) {
        e.preventDefault();
        setEmoteOpen(true);
      } else if (e.code === "KeyT" && !chatOpen && !emoteOpen) {
        e.preventDefault();
        setChatOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearbyId, paused, activeStationId, openLandmark, emoteOpen, chatOpen]);

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
    [appendFeed]
  );

  // Pause world when modals are open
  useEffect(() => {
    setPaused(Boolean(activeLandmarkId || activeStationId || profileTarget));
  }, [activeLandmarkId, activeStationId, profileTarget]);

  // --- Remote player click → profile card
  const handleRemotePlayerClick = useCallback((uid, snapshot) => {
    setProfileTarget({ uid, name: snapshot.name, color: snapshot.color });
  }, []);

  const handleLike = useCallback(async () => {
    if (!profileTarget || !myUid) return;
    setWorldLikes((w) => ({ ...w, [profileTarget.uid]: Date.now() }));
    appendFeed(`You liked ${profileTarget.name}.`, "system");
    const { mutual } = await recordWorldLike({ fromUid: myUid, toUid: profileTarget.uid });
    if (mutual) {
      appendFeed(`It's a match with ${profileTarget.name}!`, "discovery");
      grantXp(50, "first mutual match");
      sendSignal({
        toUid: profileTarget.uid,
        fromUid: myUid,
        fromName: playerName,
        fromColor: avatarColor,
        type: "like-mutual",
      });
      // Promote into the existing Firestore match queue so they appear in chat.
      promoteWorldLikeToMatch({ fromUid: myUid, toUid: profileTarget.uid }).then(
        ({ created, matchId }) => {
          if (created) {
            appendFeed(`Match opened in your inbox.`, "system");
          }
          // matchId is now navigable as /app/match/<matchId> if you want to deep-link.
          void matchId;
        }
      );
    }
  }, [profileTarget, myUid, playerName, avatarColor, appendFeed, grantXp]);

  const handleWave = useCallback(() => {
    if (!profileTarget || !myUid) return;
    sendSignal({
      toUid: profileTarget.uid,
      fromUid: myUid,
      fromName: playerName,
      fromColor: avatarColor,
      type: "wave",
    });
    appendFeed(`You wave at ${profileTarget.name}.`, "system");
    grantXp(2, "social");
  }, [profileTarget, myUid, playerName, avatarColor, appendFeed, grantXp]);

  const handleInviteChess = useCallback(() => {
    if (!profileTarget || !myUid) return;
    sendSignal({
      toUid: profileTarget.uid,
      fromUid: myUid,
      fromName: playerName,
      fromColor: avatarColor,
      type: "invite-chess",
    });
    appendFeed(`You invite ${profileTarget.name} to chess.`, "system");
    setProfileTarget(null);
    setActiveLandmarkId(null);
    setActiveStationId("chess");
  }, [profileTarget, myUid, playerName, avatarColor, appendFeed]);

  const activeLandmark = activeLandmarkId ? LANDMARKS.find((l) => l.id === activeLandmarkId) : null;
  const activeNpc = activeLandmark?.npcId ? NPCS[activeLandmark.npcId] : null;
  const nearbyLandmark = nearbyId ? LANDMARKS.find((l) => l.id === nearbyId) : null;
  const discoveredCount = Object.values(memories).filter((m) => m?.discovered).length;
  const dialogueIndex = activeLandmarkId ? memories[activeLandmarkId]?.lineIndex ?? -1 : -1;
  const dialogueExhausted = activeNpc ? dialogueIndex + 1 >= activeNpc.dialogue.length : false;
  const levelInfo = levelForXp(xp);
  const stationLandmark = activeStationId
    ? LANDMARKS.find((l) => l.activities?.some((a) => a.stationId === activeStationId))
    : null;
  const stationNpc = stationLandmark?.npcId ? NPCS[stationLandmark.npcId] : null;

  return (
    <div className="world-page">
      <div className="world-stage">
        <HubWorldScene
          controller={controller}
          playerStateRef={playerStateRef}
          onNearbyChange={handleNearbyChange}
          onPlayerSnapshot={handlePlayerSnapshot}
          nearbyLandmarkId={nearbyId}
          focusedLandmarkId={activeLandmarkId}
          paused={paused}
          avatarColor={avatarColor}
          remotePlayers={remotePlayers}
          onRemotePlayerClick={handleRemotePlayerClick}
          extrasRef={extrasRef}
        />

        <div className="world-topbar">
          <div className="world-topbar__group">
            <div className="world-avatar-chip" style={{ "--chip-color": avatarColor }}>
              <span className="world-avatar-chip__dot" />
              <span className="world-avatar-chip__name">{playerName}</span>
            </div>
            <div className="world-level-chip" title={`Level ${levelInfo.level}`}>
              <span className="world-level-chip__num">L{levelInfo.level}</span>
              <span className="world-level-chip__bar">
                <span
                  className="world-level-chip__fill"
                  style={{
                    width: `${Math.min(100, (levelInfo.into / levelInfo.needed) * 100)}%`,
                  }}
                />
              </span>
              <span className="world-level-chip__xp">
                {levelInfo.into}/{levelInfo.needed}
              </span>
            </div>
            <div className="world-progress">
              <span className="world-progress__count">
                {discoveredCount}/{LANDMARKS.length}
              </span>
              <span className="world-progress__label">spots</span>
            </div>
            {remotePlayers.length > 0 && (
              <div className="world-progress world-progress--online">
                <span className="world-progress__count">{remotePlayers.length}</span>
                <span className="world-progress__label">online</span>
              </div>
            )}
          </div>
          <div className="world-topbar__hint">
            {isTouch
              ? "Joystick walks · Tap a spot or player · 😊 emote · 💬 chat"
              : "WASD walk · Right-drag rotate · E interact · Q emote · T chat"}
          </div>
        </div>

        <div className="world-color-picker">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              className={`world-color-picker__swatch${c === avatarColor ? " is-active" : ""}`}
              style={{ background: c }}
              onClick={() => setAvatarColor(c)}
              aria-label={`Use color ${c}`}
            />
          ))}
        </div>

        <div className="world-feed" aria-live="polite">
          {feed.slice(-5).map((entry) => (
            <div key={entry.id} className={`world-feed__row world-feed__row--${entry.tone}`}>
              {entry.text}
            </div>
          ))}
        </div>

        {nearbyLandmark && !activeLandmarkId && !activeStationId && !profileTarget && (
          <div className="world-prompt">
            <button
              type="button"
              className="world-prompt__btn"
              onClick={() => openLandmark(nearbyLandmark.id)}
            >
              <span className="world-prompt__key">{isTouch ? "Tap" : "E"}</span>
              <span className="world-prompt__text">
                {nearbyLandmark.npcId
                  ? `Talk to ${NPCS[nearbyLandmark.npcId].name}`
                  : `Visit ${nearbyLandmark.name}`}
              </span>
            </button>
          </div>
        )}

        {pendingWaveSignal && (
          <div className="world-toast" onAnimationEnd={() => setPendingWaveSignal(null)}>
            👋 {pendingWaveSignal.fromName || "Someone"} waved at you
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
              😊
            </button>
            <button
              type="button"
              className="world-quick-actions__btn"
              onClick={() => setChatOpen(true)}
              aria-label="Say something"
              title="Say something (T)"
            >
              💬
            </button>
          </div>
        )}

        <ChatInput open={chatOpen} onSend={handleSayMessage} onClose={() => setChatOpen(false)} />
      </div>

      <EmoteWheel open={emoteOpen} onPick={handleEmote} onClose={() => setEmoteOpen(false)} />

      {/* Landmark/dialogue modal */}
      {activeLandmark && !activeStationId && (
        <div className="world-modal" role="dialog" aria-modal="true">
          <div className="world-modal__backdrop" onClick={closeLandmark} />
          <div className="world-modal__panel">
            <div className="world-modal__header">
              <div>
                <div className="world-modal__eyebrow">{activeNpc?.role || "Place"}</div>
                <div className="world-modal__title">
                  {activeNpc ? activeNpc.name : activeLandmark.name}
                </div>
                <div className="world-modal__subtitle">{activeLandmark.name}</div>
              </div>
              <button
                type="button"
                className="world-modal__close"
                onClick={closeLandmark}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="world-modal__blurb">
              {dialogueIndex >= 0 && activeNpc
                ? activeNpc.dialogue[dialogueIndex]
                : activeNpc?.greeting || activeLandmark.blurb}
            </p>

            <div className="world-modal__actions">
              {activeNpc && (
                <button
                  type="button"
                  className="world-modal__action world-modal__action--talk"
                  onClick={() => advanceDialogue(activeLandmark.id)}
                >
                  <span className="world-modal__action-label">
                    {dialogueExhausted ? "Wave goodbye" : dialogueIndex < 0 ? "Say hi" : "Continue"}
                  </span>
                  {!dialogueExhausted && (
                    <span className="world-modal__action-desc">
                      {dialogueIndex + 1 < (activeNpc.dialogue.length - 1)
                        ? "Hear them out."
                        : "One more thing on their mind."}
                    </span>
                  )}
                </button>
              )}

              {activeLandmark.activities.map((activity) => {
                const consumed = activity.kind === "oneShot" && memories[activeLandmark.id]?.consumed?.[activity.id];
                return (
                  <button
                    key={activity.id}
                    type="button"
                    className={`world-modal__action${consumed ? " is-disabled" : ""}`}
                    disabled={consumed}
                    onClick={() => performActivity(activeLandmark.id, activity)}
                  >
                    <span className="world-modal__action-label">
                      {consumed ? `Already ${activity.label.toLowerCase()}` : activity.label}
                    </span>
                    <span className="world-modal__action-desc">{activity.description}</span>
                  </button>
                );
              })}
            </div>

            {activeLandmark.id === "chess" && (
              <div className="world-modal__record">
                Chess record: {chessRecord.wins}W · {chessRecord.losses}L · {chessRecord.draws}D
              </div>
            )}
          </div>
        </div>
      )}

      {/* Station: lobby OR active chess game */}
      {activeStationId && (
        <div className="world-modal" role="dialog" aria-modal="true">
          <div className="world-modal__backdrop" onClick={handleLobbyCancel} />
          <div className="world-modal__panel">
            {!activeMatchInfo && !npcChessActive ? (
              <StationLobby
                stationName={stationLandmark?.name || "Station"}
                npcName={stationNpc?.name}
                myUid={myUid}
                seats={station.seats}
                match={station.match}
                onCancel={handleLobbyCancel}
                onPlayNpc={handleLobbyPlayNpc}
                onMatchReady={handleLobbyMatchReady}
              />
            ) : npcChessActive ? (
              <ChessGame
                npcName={stationNpc?.name || "Mira"}
                onClose={handleLobbyCancel}
                onResult={handleChessResult}
              />
            ) : (
              <ChessGame
                onClose={handleLobbyCancel}
                onResult={handleChessResult}
                multiplayer={{
                  myUid,
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
          liked={Boolean(worldLikes[profileTarget.uid])}
          onClose={() => setProfileTarget(null)}
          onLike={handleLike}
          onWave={handleWave}
          onInvite={handleInviteChess}
        />
      )}
    </div>
  );
}
