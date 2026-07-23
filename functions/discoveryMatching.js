const AGE_NO_LIMIT = 100;
const DISTANCE_NO_LIMIT = 100;
const EARTH_RADIUS_MILES = 3958.7613;

const SENSITIVE_PROFILE_KEYS = new Set([
  "password",
  "confirmPassword",
  "passwordConfirmation",
  "accessToken",
  "refreshToken",
  "idToken",
  "authToken",
]);

const MATCH_PROFILE_FIELDS = [
  "uid",
  "displayName",
  "name",
  "username",
  "age",
  "gender",
  "lookingFor",
  "bio",
  "media",
  "interests",
  "profilePrompts",
  "ethnicities",
  "races",
  "religions",
  "politics",
  "selfHeight",
  "zodiac",
  "zodiacSign",
];

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isNaN(number) ? fallback : number;
}

function toString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["yes", "true", "1"].includes(value.toLowerCase());
  }
  return Boolean(value);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function stripSensitiveProfileFields(profile) {
  if (!profile || typeof profile !== "object") return {};
  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => !SENSITIVE_PROFILE_KEYS.has(key)),
  );
}

function flattenDiscoveryUser(uid, data) {
  if (!uid || !data || typeof data !== "object") return null;
  const flattened = stripSensitiveProfileFields({
    uid,
    ...(data.profile || {}),
    ...data,
  });
  delete flattened.profile;

  const religions = toArray(flattened.religions);
  const ethnicities = toArray(flattened.ethnicities).length
    ? toArray(flattened.ethnicities)
    : toArray(flattened.races);
  const ethnicityPreferences = toArray(flattened.ethnicityPreferences).length
    ? toArray(flattened.ethnicityPreferences)
    : toArray(flattened.racePreferences || flattened.racePref);
  const email = toString(flattened.email);
  const username = toString(flattened.username);
  const displayName = toString(
    flattened.displayName ||
      flattened.name ||
      username ||
      email.split("@")[0] ||
      `User_${uid.slice(0, 8)}`,
  );

  return {
    ...flattened,
    uid,
    displayName,
    age: toNumber(flattened.age, 25),
    ageMin: toNumber(flattened.ageMin, 18),
    ageMax: toNumber(flattened.ageMax, AGE_NO_LIMIT),
    distMin: toNumber(flattened.distMin, 0),
    distMax: toNumber(flattened.distMax, DISTANCE_NO_LIMIT),
    gender: toString(flattened.gender, "Unknown"),
    lookingFor: toString(flattened.lookingFor, "Dating"),
    interests: toArray(flattened.interests),
    races: toArray(flattened.races),
    ethnicities,
    religions,
    media: toArray(flattened.media),
    isTrans: toString(flattened.isTrans, "no"),
    isAsexual: toString(flattened.isAsexual, "no"),
    children: toString(flattened.children, "no"),
    substances: toString(flattened.substances, "no"),
    politics: toString(flattened.politics, "moderate"),
    transPref: toString(flattened.transPref, "2"),
    asexualPref: toString(flattened.asexualPref, "2"),
    childrenPref: toString(flattened.childrenPref, "0"),
    substancePref: toString(flattened.substancePref, "0"),
    politicsPref: toString(flattened.politicsPref, "0"),
    racePrefStrength: toString(
      flattened.racePrefStrength,
      flattened.ethnicityPrefStrength ?? "0",
    ),
    ethnicityPrefStrength: toString(
      flattened.ethnicityPrefStrength,
      flattened.racePrefStrength ?? "0",
    ),
    heightDealbreaker: toString(flattened.heightDealbreaker, "0"),
    religionPref: toString(flattened.religionPref, "0"),
    genderPref: toString(flattened.genderPref, "all"),
    genderScale: toNumber(flattened.genderScale, 0),
    hasReligionPref: toBoolean(flattened.hasReligionPref || religions.length),
    hasRacePref: toBoolean(
      flattened.hasRacePref || flattened.hasEthnicityPref,
    ),
    hasEthnicityPref: toBoolean(
      flattened.hasEthnicityPref || flattened.hasRacePref,
    ),
    hasHeightPref: toBoolean(flattened.hasHeightPref),
    selfHeight: toNumber(flattened.selfHeight, 66),
    heightMin: toNumber(flattened.heightMin, 48),
    heightMax: toNumber(flattened.heightMax, 84),
    racePreferences: toArray(flattened.racePreferences),
    ethnicityPreferences,
  };
}

function requiredDiscoveryProfile(user) {
  return Boolean(
    user?.uid &&
      (user.displayName || user.name) &&
      user.age &&
      user.gender &&
      user.lookingFor &&
      Array.isArray(user.media) &&
      user.media.length > 0,
  );
}

function getCoordinates(user) {
  if (
    typeof user?.location?.lat === "number" &&
    typeof user?.location?.lng === "number"
  ) {
    return user.location;
  }
  if (typeof user?.lat === "number" && typeof user?.lng === "number") {
    return { lat: user.lat, lng: user.lng };
  }
  return null;
}

function distanceBetween(userA, userB) {
  const first = getCoordinates(userA);
  const second = getCoordinates(userB);
  if (!first || !second) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lng - first.lng);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.lat)) *
      Math.cos(radians(second.lat)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    EARTH_RADIUS_MILES *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function hasHeightPreference(user) {
  return toBoolean(user?.hasHeightPref);
}

function hasEthnicityPreference(user) {
  return toBoolean(user?.hasEthnicityPref || user?.hasRacePref);
}

function hasReligionPreference(user) {
  return (
    toBoolean(user?.hasReligionPref) || toArray(user?.religions).length > 0
  );
}

function ageOutOfRange(targetAge, ageMin, ageMax) {
  if (typeof targetAge !== "number") return false;
  const minimum = toNumber(ageMin, 18);
  const maximum = toNumber(ageMax, AGE_NO_LIMIT);
  if (minimum > 18 && targetAge < minimum) return true;
  return maximum < AGE_NO_LIMIT && targetAge > maximum;
}

function distanceOutOfRange(userA, userB) {
  const maximum = toNumber(userA.distMax, DISTANCE_NO_LIMIT);
  if (maximum >= DISTANCE_NO_LIMIT) return false;
  const distance = distanceBetween(userA, userB);
  return distance !== null && distance > maximum;
}

function genderPreferenceMismatch(preference, gender) {
  if (preference === "women" && gender === "Man") return true;
  return preference === "men" && gender === "Woman";
}

function pairIsBlocked(userA, userB) {
  return (
    toArray(userA?.blockedUsers).includes(userB?.uid) ||
    toArray(userB?.blockedUsers).includes(userA?.uid)
  );
}

function failsDealbreakers(userA, userB) {
  if (!userA || !userB || pairIsBlocked(userA, userB)) return true;
  if (distanceOutOfRange(userA, userB) || distanceOutOfRange(userB, userA)) {
    return true;
  }

  const intentA = (userA.lookingFor || "").toLowerCase();
  const intentB = (userB.lookingFor || "").toLowerCase();
  if (intentA !== "dating" && intentB !== "dating") {
    return (
      ageOutOfRange(userB.age, userA.ageMin, userA.ageMax) ||
      ageOutOfRange(userA.age, userB.ageMin, userB.ageMax)
    );
  }

  if (
    genderPreferenceMismatch(userA.genderPref, userB.gender) ||
    genderPreferenceMismatch(userB.genderPref, userA.gender) ||
    ageOutOfRange(userB.age, userA.ageMin, userA.ageMax) ||
    ageOutOfRange(userA.age, userB.ageMin, userB.ageMax)
  ) {
    return true;
  }
  if (userA.transPref === "0" && toBoolean(userB.isTrans)) return true;
  if (userA.transPref === "4" && !toBoolean(userB.isTrans)) return true;
  if (userA.asexualPref === "0" && toBoolean(userB.isAsexual)) return true;
  if (userA.asexualPref === "4" && !toBoolean(userB.isAsexual)) return true;

  const height = userB.selfHeight ?? 0;
  if (
    hasHeightPreference(userA) &&
    userA.heightDealbreaker === "3" &&
    (height < userA.heightMin || height > userA.heightMax)
  ) {
    return true;
  }

  const ethnicityPreferences = toArray(
    userA.ethnicityPreferences || userA.racePreferences,
  );
  const ethnicities = toArray(userB.ethnicities || userB.races);
  if (
    hasEthnicityPreference(userA) &&
    (userA.ethnicityPrefStrength || userA.racePrefStrength) === "3" &&
    !ethnicityPreferences.some((value) => ethnicities.includes(value))
  ) {
    return true;
  }

  const religionPreferences = toArray(userA.religions);
  const religions = toArray(userB.religions);
  if (
    hasReligionPreference(userA) &&
    userA.religionPref === "3" &&
    !religionPreferences.some((value) => religions.includes(value))
  ) {
    return true;
  }
  if (userA.childrenPref === "3" && userA.children !== userB.children) {
    return true;
  }
  if (userA.substancePref === "3" && userA.substances !== userB.substances) {
    return true;
  }
  return userA.politicsPref === "3" && userA.politics !== userB.politics;
}

function isIntentCompatible(userA, userB) {
  const first = userA?.lookingFor;
  const second = userB?.lookingFor;
  if (first === "Friendship") {
    return second === "Friendship" || second === "Both";
  }
  if (first === "Dating") return second === "Dating" || second === "Both";
  return true;
}

function genderLeanBonus(scale, gender) {
  const numericScale = toNumber(scale, 0);
  if (!numericScale || !gender) return 0;
  const normalizedGender = String(gender).toLowerCase();
  if (normalizedGender === "man") {
    return numericScale < 0 ? Math.abs(numericScale) : 0;
  }
  if (normalizedGender === "woman") {
    return numericScale > 0 ? Math.abs(numericScale) : 0;
  }
  return 0;
}

function calculateMatchScore(userA, userB) {
  let scoreA = 0;
  let maxScoreA = 0;
  let scoreB = 0;
  let maxScoreB = 0;
  const interestsA = toArray(userA.interests);
  const interestsB = toArray(userB.interests);
  const sharedInterests = interestsA.filter((interest) =>
    interestsB.includes(interest),
  );
  scoreA += sharedInterests.length * 3;
  scoreB += sharedInterests.length * 3;
  maxScoreA += interestsA.length * 3;
  maxScoreB += interestsB.length * 3;

  if (hasReligionPreference(userA) && userB.religions) {
    if (toArray(userA.religions).some((value) => toArray(userB.religions).includes(value))) {
      scoreA += toNumber(userA.religionPref) * 3;
    }
    maxScoreA += toNumber(userA.religionPref) * 3;
  }
  if (hasReligionPreference(userB) && userA.religions) {
    if (toArray(userB.religions).some((value) => toArray(userA.religions).includes(value))) {
      scoreB += toNumber(userB.religionPref) * 3;
    }
    maxScoreB += toNumber(userB.religionPref) * 3;
  }

  if (hasEthnicityPreference(userA) && (userB.ethnicities || userB.races)) {
    const preferences = toArray(userA.ethnicityPreferences || userA.racePreferences);
    const ethnicities = toArray(userB.ethnicities || userB.races);
    if (preferences.some((value) => ethnicities.includes(value))) {
      scoreA += toNumber(userA.ethnicityPrefStrength || userA.racePrefStrength) * 3;
    }
    maxScoreA += toNumber(userA.ethnicityPrefStrength || userA.racePrefStrength) * 3;
  }
  if (hasEthnicityPreference(userB) && (userA.ethnicities || userA.races)) {
    const preferences = toArray(userB.ethnicityPreferences || userB.racePreferences);
    const ethnicities = toArray(userA.ethnicities || userA.races);
    if (preferences.some((value) => ethnicities.includes(value))) {
      scoreB += toNumber(userB.ethnicityPrefStrength || userB.racePrefStrength) * 3;
    }
    maxScoreB += toNumber(userB.ethnicityPrefStrength || userB.racePrefStrength) * 3;
  }

  if (hasHeightPreference(userA)) {
    if (userA.heightMin <= userB.selfHeight && userA.heightMax >= userB.selfHeight) {
      scoreA += toNumber(userA.heightDealbreaker) * 5;
    }
    maxScoreA += toNumber(userA.heightDealbreaker) * 5;
  }
  if (hasHeightPreference(userB)) {
    if (userB.heightMin <= userA.selfHeight && userB.heightMax >= userA.selfHeight) {
      scoreB += toNumber(userB.heightDealbreaker) * 5;
    }
    maxScoreB += toNumber(userB.heightDealbreaker) * 5;
  }

  if ((userA.genderPref || "all") === "all") {
    scoreA += genderLeanBonus(userA.genderScale, userB.gender) * 2;
    maxScoreA += Math.abs(toNumber(userA.genderScale, 0)) * 2;
  }
  if ((userB.genderPref || "all") === "all") {
    scoreB += genderLeanBonus(userB.genderScale, userA.gender) * 2;
    maxScoreB += Math.abs(toNumber(userB.genderScale, 0)) * 2;
  }

  if (userA.children && userB.children && userA.children !== userB.children) {
    scoreA -= toNumber(userA.childrenPref) * 2;
    scoreB -= toNumber(userB.childrenPref) * 2;
  }
  if (userA.substances && userB.substances && userA.substances !== userB.substances) {
    scoreA -= toNumber(userA.substancePref) * 2;
    scoreB -= toNumber(userB.substancePref) * 2;
  }
  if (userA.politics && userB.politics && userA.politics !== userB.politics) {
    scoreA -= toNumber(userA.politicsPref) * 2;
    scoreB -= toNumber(userB.politicsPref) * 2;
  }

  if (userA.asexualPref === "1" && toBoolean(userB.isAsexual)) scoreA -= 3;
  if (userA.asexualPref === "3") {
    maxScoreA += 5;
    if (toBoolean(userB.isAsexual)) scoreA += 5;
  }
  if (userB.asexualPref === "1" && toBoolean(userA.isAsexual)) scoreB -= 3;
  if (userB.asexualPref === "3") {
    maxScoreB += 5;
    if (toBoolean(userA.isAsexual)) scoreB += 5;
  }
  if (userA.transPref === "1" && toBoolean(userB.isTrans)) scoreA -= 3;
  if (userA.transPref === "3") {
    maxScoreA += 5;
    if (toBoolean(userB.isTrans)) scoreA += 5;
  }
  if (userB.transPref === "1" && toBoolean(userA.isTrans)) scoreB -= 3;
  if (userB.transPref === "3") {
    maxScoreB += 5;
    if (toBoolean(userA.isTrans)) scoreB += 5;
  }

  const normalizedA = maxScoreA === 0 ? 1 : scoreA / maxScoreA;
  const normalizedB = maxScoreB === 0 ? 1 : scoreB / maxScoreB;
  const normalized = Math.max(
    0,
    Math.min(100, ((normalizedA + normalizedB) / 2) * 100),
  );
  return {
    scoreA,
    maxScoreA,
    scoreB,
    maxScoreB,
    finalScore: Math.round(normalized),
  };
}

function boundedString(value, maximum = 4000) {
  return typeof value === "string" ? value.slice(0, maximum) : undefined;
}

function boundedStringList(value, maximumItems = 30, maximumLength = 120) {
  return toArray(value)
    .filter((item) => typeof item === "string")
    .slice(0, maximumItems)
    .map((item) => item.slice(0, maximumLength));
}

function toDiscoveryMatchProfile(profile) {
  const safe = stripSensitiveProfileFields(profile);
  const result = {};
  MATCH_PROFILE_FIELDS.forEach((field) => {
    if (safe[field] !== undefined) result[field] = safe[field];
  });
  result.uid = boundedString(safe.uid, 128);
  ["displayName", "name", "username", "gender", "lookingFor", "politics", "zodiac", "zodiacSign"].forEach(
    (field) => {
      if (result[field] === undefined) return;
      const value = boundedString(result[field], 120);
      if (value === undefined) delete result[field];
      else result[field] = value;
    },
  );
  if (result.bio !== undefined) {
    const bio = boundedString(result.bio, 2000);
    if (bio === undefined) delete result.bio;
    else result.bio = bio;
  }
  result.media = toArray(result.media)
    .map((item) => (typeof item === "string" ? item : item?.url))
    .filter((item) => typeof item === "string" && item.length > 0)
    .slice(0, 6)
    .map((item) => item.slice(0, 2048));
  ["interests", "ethnicities", "races", "religions"].forEach((field) => {
    if (result[field] !== undefined) result[field] = boundedStringList(result[field]);
  });
  if (result.profilePrompts !== undefined) {
    result.profilePrompts = toArray(result.profilePrompts)
      .slice(0, 6)
      .map((prompt) => ({
        prompt: boundedString(prompt?.prompt, 240) || "",
        answer: boundedString(prompt?.answer, 1000) || "",
      }));
  }
  if (result.age !== undefined) result.age = toNumber(result.age, 0);
  if (result.selfHeight !== undefined) {
    result.selfHeight = toNumber(result.selfHeight, 0);
  }
  return result;
}

function pairQualifiesForDiscovery(userA, userB) {
  return Boolean(
    requiredDiscoveryProfile(userA) &&
      requiredDiscoveryProfile(userB) &&
      isIntentCompatible(userA, userB) &&
      isIntentCompatible(userB, userA) &&
      !failsDealbreakers(userA, userB) &&
      !failsDealbreakers(userB, userA),
  );
}

module.exports = {
  calculateMatchScore,
  distanceBetween,
  failsDealbreakers,
  flattenDiscoveryUser,
  isIntentCompatible,
  pairQualifiesForDiscovery,
  requiredDiscoveryProfile,
  toDiscoveryMatchProfile,
};
