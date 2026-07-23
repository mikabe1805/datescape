export function otherProfileFromMatch(match, currentUid) {
  if (!match || typeof match !== "object" || !currentUid) return null;
  const isUserA = match.userA === currentUid;
  const isUserB = match.userB === currentUid;
  if (!isUserA && !isUserB) return null;

  const uid = isUserA ? match.userB : match.userA;
  const profile = isUserA ? match.userBProfile : match.userAProfile;
  if (!uid || !profile || typeof profile !== "object") return null;
  return { ...profile, uid };
}
