function calculateAge(birthdate) {
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function dummyDistance(userA, userB) {
  return 10;
}

export function calculateMatchScore(userA, userB) {
  let score = 0;

  if (dealbreakerFailed(userA, userB) || dealbreakerFailed(userB, userA)) {
    return 0;
  }

  score += transScoring(userA, userB);
  score += asexualScoring(userA, userB);
  score += heightScoring(userA, userB);
  score += raceScoring(userA, userB);
  score += religionScoring(userA, userB);
  score += childrenScoring(userA, userB);
  score += substanceScoring(userA, userB);
  score += politicalScoring(userA, userB);
  score += distanceScoring(userA, userB);
  score += interestsScoring(userA, userB);

  return score;
}

function dealbreakerFailed(userA, userB) {
  const height = userB.selfHeight ?? 0;

  if (userA.transPref === "dealbreaker" && userB.isTrans === "yes") return true;
  if (userA.asexualPref === "dealbreaker" && userB.isAsexual === "yes") return true;

  if (userA.heightDealbreaker === "dealbreaker" && (height < userA.heightMin || height > userA.heightMax)) return true;

  const racePref = arraySafe(userA.racePref);
  const theirRace = arraySafe(userB.races);
  if (userA.raceDealbreaker === "dealbreaker" && !racePref.some(r => theirRace.includes(r))) return true;

  const religionPref = arraySafe(userA.religionPref);
  const theirReligion = arraySafe(userB.religions);
  if (userA.religionDealbreaker === "dealbreaker" && !religionPref.some(r => theirReligion.includes(r))) return true;

  if (userA.childrenDealbreaker === "dealbreaker" && userA.children !== userB.children) return true;
  if (userA.substanceDealbreaker === "dealbreaker" && userA.substanceUse !== userB.substanceUse) return true;
  if (userA.politicalDealbreaker === "dealbreaker" && userA.politicalAlignment !== userB.politicalAlignment) return true;

  const distance = dummyDistance(userA, userB);
  if (distance < userA.distanceMin || distance > userA.distanceMax) return true;

  return false;
}

// Scoring Logic
function transScoring(userA, userB) {
  if (userA.transPref === "preferred" && userB.isTrans === "yes") return 5;
  if (userA.transPref === "preferred not" && userB.isTrans === "yes") return -3;
  return 0;
}

function asexualScoring(userA, userB) {
  if (userA.asexualPref === "preferred" && userB.isAsexual === "yes") return 5;
  if (userA.asexualPref === "preferred not" && userB.isAsexual === "yes") return -3;
  return 0;
}

function heightScoring(userA, userB) {
  const height = userB.selfHeight ?? 0;
  if (height >= userA.heightMin && height <= userA.heightMax) {
    if (userA.heightDealbreaker === "strong") return 10;
    if (userA.heightDealbreaker === "weak") return 3;
  } else {
    if (userA.heightDealbreaker === "weak") return -10;
  }
  return 0;
}

function raceScoring(userA, userB) {
  const pref = arraySafe(userA.racePref);
  const theirRace = arraySafe(userB.races);
  if (pref.length === 0 || theirRace.length === 0) return 0;

  const shared = pref.filter(r => theirRace.includes(r));
  if (shared.length > 0) {
    if (userA.raceDealbreaker === "strong") return 10;
    if (userA.raceDealbreaker === "weak") return 3;
  } else {
    if (userA.raceDealbreaker === "weak") return -10;
  }
  return 0;
}

function religionScoring(userA, userB) {
  const pref = arraySafe(userA.religionPref);
  const theirReligion = arraySafe(userB.religions);
  if (pref.length === 0 || theirReligion.length === 0) return 0;

  const shared = pref.filter(r => theirReligion.includes(r));
  if (shared.length > 0) {
    if (userA.religionDealbreaker === "strong") return 10;
    if (userA.religionDealbreaker === "weak") return 3;
  } else {
    if (userA.religionDealbreaker === "weak") return -10;
  }
  return 0;
}

function childrenScoring(userA, userB) {
  if (userA.children === userB.children) {
    if (userA.childrenDealbreaker === "strong") return 10;
    if (userA.childrenDealbreaker === "weak") return 3;
  } else {
    if (userA.childrenDealbreaker === "weak") return -10;
  }
  return 0;
}

function substanceScoring(userA, userB) {
  if (userA.substanceUse === userB.substanceUse) {
    if (userA.substanceDealbreaker === "strong") return 10;
    if (userA.substanceDealbreaker === "weak") return 3;
  } else {
    if (userA.substanceDealbreaker === "weak") return -10;
  }
  return 0;
}

function politicalScoring(userA, userB) {
  if (userA.politicalAlignment === userB.politicalAlignment) {
    if (userA.politicalDealbreaker === "strong") return 10;
    if (userA.politicalDealbreaker === "weak") return 3;
  } else {
    if (userA.politicalDealbreaker === "weak") return -10;
  }
  return 0;
}

function distanceScoring(userA, userB) {
  const distance = dummyDistance(userA, userB);
  if (distance >= userA.distanceMin && distance <= userA.distanceMax) return 5;
  return 0;
}

function interestsScoring(userA, userB) {
  const interestsA = arraySafe(userA.interests);
  const interestsB = arraySafe(userB.interests);
  const shared = interestsA.filter(i => interestsB.includes(i));
  return shared.length * 3;
}

// Safety function to handle missing arrays
function arraySafe(val) {
  return Array.isArray(val) ? val : [];
}
