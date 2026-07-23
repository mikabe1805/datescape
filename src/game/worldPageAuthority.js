export function avatarAuthorityIsReady({
  authUid,
  profileHydratedUid,
  progressionHydratedUid,
}) {
  if (!authUid) return true;
  return (
    profileHydratedUid === authUid && progressionHydratedUid === authUid
  );
}

export function questActionIsConfirmed(action, status) {
  if (action === "accept") {
    return (
      status === "active" ||
      status === "ready-to-turn-in" ||
      status === "completed"
    );
  }
  if (action === "turn-in") return status === "completed";
  return false;
}

export function expeditionReceiptSyncDisposition(status) {
  if (status === "ready-to-turn-in" || status === "completed") {
    return "confirmed";
  }
  if (status === "active") return "retry";
  return "settled";
}

export function mutationWasConfirmed(result) {
  return result?.applied === true || result?.duplicate === true;
}

export function lanternkeeperCompletionCopy(status) {
  if (status === "ready-to-turn-in") {
    return "The Lanternkeeper trail shines from glasshouse to garden. Your verified quest receipt is ready to return to Juno.";
  }
  if (status === "completed") {
    return "The Lanternkeeper trail shines again. This replay changes no quest rewards.";
  }
  return "The Lanternkeeper trail shines from glasshouse to garden. The route is complete; quest eligibility is verified for each traveler individually.";
}

export function resonanceEchoIsEligible(quest, objective) {
  return Boolean(
    quest?.id === "afterlight-sunthread" &&
      quest.status === "active" &&
      objective?.id === "resonate-together" &&
      objective.status !== "complete",
  );
}

export function sharedEncounterForAfterglow(encounters, afterglow) {
  const mode = afterglow?.mode;
  if (
    !Array.isArray(encounters) ||
    (mode !== "resonance" && mode !== "social") ||
    !afterglow.matchId
  ) {
    return null;
  }
  return (
    encounters.find(
      (encounter) =>
        encounter?.mode === mode &&
        encounter.sourceId === afterglow.matchId &&
        (!afterglow.opponent?.uid ||
          encounter.opponent?.uid === afterglow.opponent.uid),
    ) || null
  );
}

export function selectVisibleWorldCohort(
  players,
  origin,
  { blockedUids = [], mutedUids = [], maxPlayers = 16 } = {},
) {
  if (!Array.isArray(players)) return [];
  const blocked = new Set(Array.isArray(blockedUids) ? blockedUids : []);
  const muted = new Set(Array.isArray(mutedUids) ? mutedUids : []);
  const originX = Number.isFinite(origin?.x) ? origin.x : 0;
  const originZ = Number.isFinite(origin?.z) ? origin.z : 0;
  const safeLimit = Number.isInteger(maxPlayers)
    ? Math.max(1, Math.min(16, maxPlayers))
    : 16;

  return players
    .filter(
      (player) =>
        typeof player?.uid === "string" &&
        !blocked.has(player.uid) &&
        Number.isFinite(player.x) &&
        Number.isFinite(player.z),
    )
    .map((player) => ({
      player,
      distanceSquared:
        (player.x - originX) ** 2 + (player.z - originZ) ** 2,
    }))
    .sort(
      (first, second) =>
        first.distanceSquared - second.distanceSquared ||
        first.player.uid.localeCompare(second.player.uid),
    )
    .slice(0, safeLimit)
    .map(({ player }) =>
      muted.has(player.uid) ? { ...player, say: null } : player,
    );
}
