import { haversineMiles, AGE_NO_LIMIT, DISTANCE_NO_LIMIT } from "./geo";

function toNum(val, fallback = 0) {
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

// Pull lat/lng off a user object that may have nested `location` or
// flat `lat`/`lng` fields, depending on age of the document.
function getCoords(user) {
  const fromLocation = user?.location;
  if (
    fromLocation &&
    typeof fromLocation.lat === "number" &&
    typeof fromLocation.lng === "number"
  ) {
    return { lat: fromLocation.lat, lng: fromLocation.lng };
  }
  if (typeof user?.lat === "number" && typeof user?.lng === "number") {
    return { lat: user.lat, lng: user.lng };
  }
  return null;
}

// Returns the distance in miles between two users, or null if either
// hasn't shared coordinates yet (treat as "unknown — don't filter out").
export function distanceBetween(userA, userB) {
  const a = getCoords(userA);
  const b = getCoords(userB);
  if (!a || !b) return null;
  return haversineMiles(a.lat, a.lng, b.lat, b.lng);
}

function toBool(val) {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    return ["true", "1", "yes"].includes(val.toLowerCase());
  }
  return Boolean(val);
}

function arraySafe(val) {
  return Array.isArray(val) ? val : [];
}

function hasHeightPreference(user) {
  return toBool(user?.hasHeightPref);
}

function hasEthnicityPreference(user) {
  return toBool(user?.hasEthnicityPref || user?.hasRacePref);
}

function hasReligionPreference(user) {
  return toBool(user?.hasReligionPref) || arraySafe(user?.religions).length > 0;
}

function genderLeanBonus(scale, gender) {
  const numericScale = toNum(scale, 0);
  if (!numericScale || !gender) return 0;

  const normalizedGender = String(gender).toLowerCase();
  if (normalizedGender === "man") return numericScale < 0 ? Math.abs(numericScale) : 0;
  if (normalizedGender === "woman") return numericScale > 0 ? Math.abs(numericScale) : 0;
  return 0;
}

// Age filter that respects "no limit" sentinels.
// ageMin <= AGE_DEFAULT_MIN (18) → no lower bound
// ageMax >= AGE_NO_LIMIT (100) → no upper bound
function ageOutOfRange(targetAge, ageMin, ageMax) {
  if (typeof targetAge !== "number") return false;
  const minNum = toNum(ageMin, 18);
  const maxNum = toNum(ageMax, AGE_NO_LIMIT);
  if (minNum > 18 && targetAge < minNum) return true;
  if (maxNum < AGE_NO_LIMIT && targetAge > maxNum) return true;
  return false;
}

// Distance filter. distMax >= DISTANCE_NO_LIMIT means user accepts any distance.
// Returns true to mean "fails" (i.e. should be excluded).
function distanceOutOfRange(userA, userB) {
  const distMax = toNum(userA.distMax, DISTANCE_NO_LIMIT);
  if (distMax >= DISTANCE_NO_LIMIT) return false; // user opted out of distance filter
  const distance = distanceBetween(userA, userB);
  if (distance === null) return false; // either user hasn't shared location → permissive
  return distance > distMax;
}

function genderPrefMismatch(pref, otherGender) {
  if (pref === "women" && otherGender === "Man") return true;
  if (pref === "men" && otherGender === "Woman") return true;
  return false;
}

function isBlocked(userA, userB) {
  if (!userA || !userB) return false;
  const aBlocked = arraySafe(userA.blockedUsers);
  const bBlocked = arraySafe(userB.blockedUsers);
  return aBlocked.includes(userB.uid) || bBlocked.includes(userA.uid);
}

export function failsDealbreakers(userA, userB) {
  const nameA = userA.displayName || userA.name || userA.uid;
  const nameB = userB.displayName || userB.name || userB.uid;

  const lcA = (userA.lookingFor || "").toLowerCase();
  const lcB = (userB.lookingFor || "").toLowerCase();

  if (isBlocked(userA, userB)) {
    console.log(`Block: ${nameA} and ${nameB} have a block between them`);
    return true;
  }

  // Distance applies regardless of intent — friendship can still want local people.
  if (distanceOutOfRange(userA, userB) || distanceOutOfRange(userB, userA)) {
    console.log(`Distance: ${nameA} and ${nameB} fail mutual distance limits`);
    return true;
  }

  if (lcA !== "dating" && lcB !== "dating") {
    if (ageOutOfRange(userB.age, userA.ageMin, userA.ageMax)) return true;
    if (ageOutOfRange(userA.age, userB.ageMin, userB.ageMax)) return true;
    return false;
  }

  if (genderPrefMismatch(userA.genderPref, userB.gender)) {
    console.log(`Gender mismatch: ${nameA} prefers ${userA.genderPref}, ${nameB} is ${userB.gender}`);
    return true;
  }
  if (genderPrefMismatch(userB.genderPref, userA.gender)) {
    console.log(`Gender mismatch: ${nameB} prefers ${userB.genderPref}, ${nameA} is ${userA.gender}`);
    return true;
  }
  if (ageOutOfRange(userB.age, userA.ageMin, userA.ageMax)) {
    console.log(`Age out of range: ${nameB} (${userB.age}) not within ${nameA}'s range (${userA.ageMin}-${userA.ageMax})`);
    return true;
  }
  if (ageOutOfRange(userA.age, userB.ageMin, userB.ageMax)) {
    console.log(`Age out of range: ${nameA} (${userA.age}) not within ${nameB}'s range (${userB.ageMin}-${userB.ageMax})`);
    return true;
  }
  if (userA.transPref === "0" && toBool(userB.isTrans)) {
    console.log(`Trans dealbreaker: ${nameA} does not want trans users, but ${nameB} is trans`);
    return true;
  }
  if (userA.transPref === "4" && !toBool(userB.isTrans)) {
    console.log(`Trans dealbreaker: ${nameA} only wants trans users, but ${nameB} is not trans`);
    return true;
  }
  if (userA.asexualPref === "0" && toBool(userB.isAsexual)) {
    console.log(`Asexual dealbreaker: ${nameA} does not want asexual users, but ${nameB} is`);
    return true;
  }
  if (userA.asexualPref === "4" && !toBool(userB.isAsexual)) {
    console.log(`Asexual dealbreaker: ${nameA} only wants asexual users, but ${nameB} is not`);
    return true;
  }

  const height = userB.selfHeight ?? 0;
  if (
    hasHeightPreference(userA) &&
    userA.heightDealbreaker === "3" &&
    (height < userA.heightMin || height > userA.heightMax)
  ) {
    console.log(`Height dealbreaker: ${nameB}'s height (${height}) not within ${nameA}'s preferred range (${userA.heightMin}-${userA.heightMax})`);
    return true;
  }

  const ethnicityPreferences = arraySafe(userA.ethnicityPreferences || userA.racePreferences);
  const theirEthnicities = arraySafe(userB.ethnicities || userB.races);
  if (
    hasEthnicityPreference(userA) &&
    (userA.ethnicityPrefStrength || userA.racePrefStrength) === "3" &&
    !ethnicityPreferences.some((value) => theirEthnicities.includes(value))
  ) {
    console.log(`Ethnicity dealbreaker: ${nameA}'s preferred ethnicities do not include ${nameB}`);
    return true;
  }

  const religionPreferences = arraySafe(userA.religions);
  const theirReligions = arraySafe(userB.religions);
  if (
    hasReligionPreference(userA) &&
    userA.religionPref === "3" &&
    !religionPreferences.some((value) => theirReligions.includes(value))
  ) {
    console.log(`Religion dealbreaker: ${nameA}'s religions do not include any of ${nameB}'s`);
    return true;
  }

  if (userA.childrenPref === "3" && userA.children !== userB.children) {
    console.log(`Children preference: ${nameA} wants ${userA.children}, ${nameB} has ${userB.children}`);
    return true;
  }

  if (userA.substancePref === "3" && userA.substances !== userB.substances) {
    console.log(`Substance dealbreaker: ${nameA} wants ${userA.substances}, ${nameB} uses ${userB.substances}`);
    return true;
  }

  if (userA.politicsPref === "3" && userA.politics !== userB.politics) {
    console.log(`Politics dealbreaker: ${nameA} is ${userA.politics}, ${nameB} is ${userB.politics}`);
    return true;
  }

  return false;
}

export function isIntentCompatible(userA, userB) {
  const a = userA.lookingFor;
  const b = userB.lookingFor;

  if (a === "Friendship") return b === "Friendship" || b === "Both";
  if (a === "Dating") return b === "Dating" || b === "Both";
  return true;
}

export function calculateMatchScore(userA, userB) {
  let scoreA = 0;
  let maxScoreA = 0;
  let scoreB = 0;
  let maxScoreB = 0;

  const interestsA = Array.isArray(userA.interests) ? userA.interests : [];
  const interestsB = Array.isArray(userB.interests) ? userB.interests : [];

  const sharedInterests = interestsA.filter((interest) => interestsB.includes(interest));
  scoreA += sharedInterests.length * 3;
  scoreB += sharedInterests.length * 3;
  maxScoreA += interestsA.length * 3;
  maxScoreB += interestsB.length * 3;

  if (hasReligionPreference(userA) && userB.religions) {
    const prefs = arraySafe(userA.religions);
    const theirs = arraySafe(userB.religions);
    if (prefs.some((value) => theirs.includes(value))) {
      scoreA += toNum(userA.religionPref) * 3;
    }
    maxScoreA += toNum(userA.religionPref) * 3;
  }

  if (hasReligionPreference(userB) && userA.religions) {
    const prefs = arraySafe(userB.religions);
    const theirs = arraySafe(userA.religions);
    if (prefs.some((value) => theirs.includes(value))) {
      scoreB += toNum(userB.religionPref) * 3;
    }
    maxScoreB += toNum(userB.religionPref) * 3;
  }

  if (hasEthnicityPreference(userA) && (userB.ethnicities || userB.races)) {
    const prefs = arraySafe(userA.ethnicityPreferences || userA.racePreferences);
    const theirs = arraySafe(userB.ethnicities || userB.races);
    if (prefs.some((value) => theirs.includes(value))) {
      scoreA += toNum(userA.ethnicityPrefStrength || userA.racePrefStrength) * 3;
    }
    maxScoreA += toNum(userA.ethnicityPrefStrength || userA.racePrefStrength) * 3;
  }

  if (hasEthnicityPreference(userB) && (userA.ethnicities || userA.races)) {
    const prefs = arraySafe(userB.ethnicityPreferences || userB.racePreferences);
    const theirs = arraySafe(userA.ethnicities || userA.races);
    if (prefs.some((value) => theirs.includes(value))) {
      scoreB += toNum(userB.ethnicityPrefStrength || userB.racePrefStrength) * 3;
    }
    maxScoreB += toNum(userB.ethnicityPrefStrength || userB.racePrefStrength) * 3;
  }

  if (hasHeightPreference(userA)) {
    if (userA.heightMin <= userB.selfHeight && userA.heightMax >= userB.selfHeight) {
      scoreA += toNum(userA.heightDealbreaker) * 5;
    }
    maxScoreA += toNum(userA.heightDealbreaker) * 5;
  }

  if (hasHeightPreference(userB)) {
    if (userB.heightMin <= userA.selfHeight && userB.heightMax >= userA.selfHeight) {
      scoreB += toNum(userB.heightDealbreaker) * 5;
    }
    maxScoreB += toNum(userB.heightDealbreaker) * 5;
  }

  if ((userA.genderPref || "all") === "all") {
    scoreA += genderLeanBonus(userA.genderScale, userB.gender) * 2;
    maxScoreA += Math.abs(toNum(userA.genderScale, 0)) * 2;
  }

  if ((userB.genderPref || "all") === "all") {
    scoreB += genderLeanBonus(userB.genderScale, userA.gender) * 2;
    maxScoreB += Math.abs(toNum(userB.genderScale, 0)) * 2;
  }

  if (userA.children && userB.children && userA.children !== userB.children) {
    scoreA -= toNum(userA.childrenPref) * 2;
    scoreB -= toNum(userB.childrenPref) * 2;
  }

  if (userA.substances && userB.substances && userA.substances !== userB.substances) {
    scoreA -= toNum(userA.substancePref) * 2;
    scoreB -= toNum(userB.substancePref) * 2;
  }

  if (userA.politics && userB.politics && userA.politics !== userB.politics) {
    scoreA -= toNum(userA.politicsPref) * 2;
    scoreB -= toNum(userB.politicsPref) * 2;
  }

  if (userA.asexualPref === "1" && toBool(userB.isAsexual)) {
    scoreA -= 3;
  }
  if (userA.asexualPref === "3") {
    maxScoreA += 5;
    if (toBool(userB.isAsexual)) scoreA += 5;
  }

  if (userB.asexualPref === "1" && toBool(userA.isAsexual)) {
    scoreB -= 3;
  }
  if (userB.asexualPref === "3") {
    maxScoreB += 5;
    if (toBool(userA.isAsexual)) scoreB += 5;
  }

  if (userA.transPref === "1" && toBool(userB.isTrans)) {
    scoreA -= 3;
  }
  if (userA.transPref === "3") {
    maxScoreA += 5;
    if (toBool(userB.isTrans)) scoreA += 5;
  }

  if (userB.transPref === "1" && toBool(userA.isTrans)) {
    scoreB -= 3;
  }
  if (userB.transPref === "3") {
    maxScoreB += 5;
    if (toBool(userA.isTrans)) scoreB += 5;
  }

  const normalizedA = maxScoreA === 0 ? 1 : scoreA / maxScoreA;
  const normalizedB = maxScoreB === 0 ? 1 : scoreB / maxScoreB;
  let finalNormalizedScore = ((normalizedA + normalizedB) / 2) * 100;
  finalNormalizedScore = Math.max(0, Math.min(100, finalNormalizedScore));

  return {
    scoreA,
    maxScoreA,
    scoreB,
    maxScoreB,
    finalScore: Math.round(finalNormalizedScore)
  };
}
