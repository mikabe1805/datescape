"use strict";

const WORLD_CALLING_CARD_ROOM = "afterlight-market-garden-v1";
const CALLING_CARD_PRESENCE_FRESH_MS = 15_000;
const SESSION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function safeCallingCardRoom(value) {
  return value === WORLD_CALLING_CARD_ROOM ? value : null;
}

function validSession(value) {
  return typeof value === "string" && SESSION_PATTERN.test(value);
}

function freshPresence(root, room, uid, sessionId, now) {
  const membership = root?.worldRoomMemberships?.[room]?.[uid];
  const presence = root?.presence?.[room]?.[uid];
  return Boolean(
    validSession(sessionId) &&
      membership?.sessionId === sessionId &&
      presence?.sessionId === sessionId &&
      Number.isFinite(presence?.lastUpdate) &&
      presence.lastUpdate >= now - CALLING_CARD_PRESENCE_FRESH_MS &&
      presence.lastUpdate <= now + 5_000,
  );
}

function callingCardPresenceIsAuthorized(
  root,
  { callerUid, targetUid, room, now = Date.now() },
) {
  if (
    !safeCallingCardRoom(room) ||
    typeof callerUid !== "string" ||
    typeof targetUid !== "string" ||
    callerUid === targetUid
  ) {
    return false;
  }

  const callerSession = root?.worldRoomMemberships?.[room]?.[callerUid]?.sessionId;
  const targetSession = root?.worldRoomMemberships?.[room]?.[targetUid]?.sessionId;
  return Boolean(
    freshPresence(root, room, callerUid, callerSession, now) &&
      freshPresence(root, room, targetUid, targetSession, now) &&
      root?.worldPresenceViews?.[callerUid]?.[room]?.[targetUid] ===
        targetSession &&
      root?.worldPresenceViews?.[targetUid]?.[room]?.[callerUid] ===
        callerSession &&
      root?.worldBlockEdges?.[callerUid]?.[targetUid] !== true &&
      root?.worldBlockEdges?.[targetUid]?.[callerUid] !== true &&
      root?.worldAccountDeletionTombstones?.[callerUid] !== true &&
      root?.worldAccountDeletionTombstones?.[targetUid] !== true,
  );
}

module.exports = {
  CALLING_CARD_PRESENCE_FRESH_MS,
  WORLD_CALLING_CARD_ROOM,
  callingCardPresenceIsAuthorized,
  safeCallingCardRoom,
};
