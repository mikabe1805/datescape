const SAFE_UID = /^[A-Za-z0-9_-]{1,128}$/;

function blockedUsersFromUser(value) {
  if (!Array.isArray(value?.blockedUsers)) return new Set();
  return new Set(
    value.blockedUsers.filter(
      (uid) => typeof uid === "string" && SAFE_UID.test(uid),
    ),
  );
}

function hasLanternkeeperBlock(joinerUid, joiner, memberUid, member) {
  return (
    blockedUsersFromUser(joiner).has(memberUid) ||
    blockedUsersFromUser(member).has(joinerUid)
  );
}

function lanternkeeperParticipantSetIsUnblocked(participantUids, usersByUid) {
  if (!Array.isArray(participantUids) || !(usersByUid instanceof Map)) {
    return false;
  }
  const uids = [...new Set(participantUids)];
  if (
    !uids.length ||
    uids.some(
      (uid) =>
        typeof uid !== "string" ||
        !SAFE_UID.test(uid) ||
        !usersByUid.has(uid),
    )
  ) {
    return false;
  }
  for (let firstIndex = 0; firstIndex < uids.length; firstIndex += 1) {
    const firstUid = uids[firstIndex];
    const first = usersByUid.get(firstUid);
    if (!first || typeof first !== "object" || Array.isArray(first)) {
      return false;
    }
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < uids.length;
      secondIndex += 1
    ) {
      const secondUid = uids[secondIndex];
      const second = usersByUid.get(secondUid);
      if (
        !second ||
        typeof second !== "object" ||
        Array.isArray(second) ||
        hasLanternkeeperBlock(firstUid, first, secondUid, second)
      ) {
        return false;
      }
    }
  }
  return true;
}

function lanternkeeperMembershipConflict(value, instanceId, now) {
  return Boolean(
    value?.activeInstanceId &&
      value.activeInstanceId !== instanceId &&
      Number(value.activeExpiresAt) > now,
  );
}

module.exports = {
  blockedUsersFromUser,
  hasLanternkeeperBlock,
  lanternkeeperParticipantSetIsUnblocked,
  lanternkeeperMembershipConflict,
};
