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
export function failsDealbreakers(userA, userB) {
  // Intent compatibility already handled before calling this
  if (userA.transPref === "dealbreaker" && userB.isTrans === "yes") return true;
  if (userA.asexualPref === "dealbreaker" && userB.isAsexual === "yes") return true;

  const height = userB.selfHeight ?? 0;
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

  return false;
}

// Intent filter: call this BEFORE scoring
export function isIntentCompatible(userA, userB) {
  const a = userA.lookingFor;
  const b = userB.lookingFor;

  if (a === "Friendship") return b === "Friendship" || b === "Both";
  if (a === "Dating") return b === "Dating" || b === "Both";
  return true;
}

export function calculateMatchScore(userA, userB) {
  let totalScore = 0;
  let totalPossible = 0;

  const sections = [
    transScoring(userA, userB),
    asexualScoring(userA, userB),
    heightScoring(userA, userB),
    raceScoring(userA, userB),
    religionScoring(userA, userB),
    childrenScoring(userA, userB),
    substanceScoring(userA, userB),
    politicalScoring(userA, userB),
    interestsScoring(userA, userB),
  ];

  for (let { score, possible } of sections) {
    totalScore += score;
    totalPossible += possible;
  }

  if (totalPossible === 0) return 100; // Perfect match if no preferences selected

  const percentage = Math.max(0, Math.min(100, Math.round((totalScore / totalPossible) * 100)));
  return percentage;
}

// Each scoring section returns: { score, possiblePoints }

function transScoring(userA, userB) {
  let score = 0, possible = 0;
  if (!userA.transPref) return { score, possible };

  possible = 5;
  if (userA.transPref === "preferred" && userB.isTrans === "yes") score = 5;
  if (userA.transPref === "preferred not" && userB.isTrans === "yes") score = -3;

  return { score, possible };
}

function asexualScoring(userA, userB) {
  let score = 0, possible = 0;
  if (!userA.asexualPref) return { score, possible };

  possible = 5;
  if (userA.asexualPref === "preferred" && userB.isAsexual === "yes") score = 5;
  if (userA.asexualPref === "preferred not" && userB.isAsexual === "yes") score = -3;

  return { score, possible };
}

function heightScoring(userA, userB) {
  let score = 0, possible = 0;
  const height = userB.selfHeight ?? 0;
  if (!userA.heightMin || !userA.heightMax) return { score, possible };

  possible = 10;
  if (height >= userA.heightMin && height <= userA.heightMax) {
    if (userA.heightDealbreaker === "strong") score = 10;
    if (userA.heightDealbreaker === "weak") score = 3;
  } else if (userA.heightDealbreaker === "weak") {
    score = -10;
  }
  return { score, possible };
}

function raceScoring(userA, userB) {
  let score = 0, possible = 0;
  const pref = arraySafe(userA.racePref);
  const theirRace = arraySafe(userB.races);
  if (pref.length === 0) return { score, possible };

  possible = userA.raceDealbreaker === "strong" ? 10 : 3;
  const shared = pref.filter(r => theirRace.includes(r));

  if (shared.length > 0) {
    score = possible;
  } else if (userA.raceDealbreaker === "weak") {
    score = -10;
  }
  return { score, possible };
}

function religionScoring(userA, userB) {
  let score = 0, possible = 0;
  const pref = arraySafe(userA.religionPref);
  const theirReligion = arraySafe(userB.religions);
  if (pref.length === 0) return { score, possible };

  possible = userA.religionDealbreaker === "strong" ? 10 : 3;
  const shared = pref.filter(r => theirReligion.includes(r));

  if (shared.length > 0) {
    score = possible;
  } else if (userA.religionDealbreaker === "weak") {
    score = -10;
  }
  return { score, possible };
}

function childrenScoring(userA, userB) {
  let score = 0, possible = 0;
  if (!userA.childrenDealbreaker) return { score, possible };

  possible = userA.childrenDealbreaker === "strong" ? 10 : 3;
  if (userA.children === userB.children) {
    score = possible;
  } else if (userA.childrenDealbreaker === "weak") {
    score = -10;
  }
  return { score, possible };
}

function substanceScoring(userA, userB) {
  let score = 0, possible = 0;
  if (!userA.substanceDealbreaker) return { score, possible };

  possible = userA.substanceDealbreaker === "strong" ? 10 : 3;
  if (userA.substanceUse === userB.substanceUse) {
    score = possible;
  } else if (userA.substanceDealbreaker === "weak") {
    score = -10;
  }
  return { score, possible };
}

function politicalScoring(userA, userB) {
  let score = 0, possible = 0;
  if (!userA.politicalDealbreaker) return { score, possible };

  possible = userA.politicalDealbreaker === "strong" ? 10 : 3;
  if (userA.politicalAlignment === userB.politicalAlignment) {
    score = possible;
  } else if (userA.politicalDealbreaker === "weak") {
    score = -10;
  }
  return { score, possible };
}

function interestsScoring(userA, userB) {
  let score = 0;
  const interestsA = arraySafe(userA.interests);
  const interestsB = arraySafe(userB.interests);
  const shared = interestsA.filter(i => interestsB.includes(i));

  const possible = interestsA.length * 3; 
  score = shared.length * 3;

  return { score, possible };
}

function arraySafe(val) {
  return Array.isArray(val) ? val : [];
}
