"use strict";

const MATCH_DECISIONS = Object.freeze(["like", "pass", "unmatch"]);

function safeMatchId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{1,300}$/.test(trimmed) ? trimmed : null;
}

function safeMatchDecision(value) {
  return MATCH_DECISIONS.includes(value) ? value : null;
}

function blockedUsers(profile) {
  return new Set(
    Array.isArray(profile?.blockedUsers)
      ? profile.blockedUsers.filter((uid) => typeof uid === "string")
      : [],
  );
}

function matchPairIsBlocked(match, userAProfile, userBProfile) {
  if (!match || typeof match !== "object") return true;
  const userA = match.userA;
  const userB = match.userB;
  if (typeof userA !== "string" || typeof userB !== "string") return true;
  if (Array.isArray(match.blockedBy) && match.blockedBy.length > 0) return true;
  return (
    blockedUsers(userAProfile).has(userB) ||
    blockedUsers(userBProfile).has(userA)
  );
}

function participantSide(match, uid) {
  if (match?.userA === uid) return "A";
  if (match?.userB === uid) return "B";
  return null;
}

function reject(code, message) {
  return { ok: false, code, message };
}

function reduceMatchDecision(match, { uid, decision }) {
  const side = participantSide(match, uid);
  if (!side) return reject("permission-denied", "This match is not available.");
  if (!safeMatchDecision(decision)) {
    return reject("invalid-argument", "Choose a valid match response.");
  }

  const ownLike = side === "A" ? "likedByA" : "likedByB";
  const otherLike = side === "A" ? "likedByB" : "likedByA";
  const ownActive = side === "A" ? "isActiveA" : "isActiveB";

  if (decision === "unmatch") {
    const alreadyEnded =
      match.matched !== true &&
      match.likedByA === false &&
      match.likedByB === false &&
      match.isActiveA === false &&
      match.isActiveB === false;
    if (alreadyEnded) {
      return { ok: true, applied: false, matched: false, updates: {} };
    }
    if (match.matched !== true) {
      return reject("failed-precondition", "This connection is already closed.");
    }
    return {
      ok: true,
      applied: true,
      matched: false,
      updates: {
        likedByA: false,
        likedByB: false,
        isActiveA: false,
        isActiveB: false,
        matched: false,
      },
    };
  }

  if (match.matched === true) {
    return reject("failed-precondition", "This match decision is already complete.");
  }

  const liked = decision === "like";
  if (match[ownActive] !== true) {
    if (match[ownLike] === liked) {
      return {
        ok: true,
        applied: false,
        matched: match.matched === true,
        updates: {},
      };
    }
    return reject("failed-precondition", "This match decision is no longer open.");
  }

  const matched = liked && match[otherLike] === true;
  return {
    ok: true,
    applied: true,
    matched,
    updates: {
      [ownLike]: liked,
      [ownActive]: false,
      ...(matched
        ? {
            isActiveA: false,
            isActiveB: false,
            matched: true,
          }
        : {}),
    },
  };
}

module.exports = {
  MATCH_DECISIONS,
  matchPairIsBlocked,
  participantSide,
  reduceMatchDecision,
  safeMatchDecision,
  safeMatchId,
};
