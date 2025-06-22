function dummyDistance(userA, userB) {
  return 10;
}

function toNum(val, fallback = 0) {
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

export function failsDealbreakers(userA, userB) {
  if (userA.lookingFor !== "dating" || userB.lookingFor !== "dating") {
    if (userB.age > userA.ageMax || userB.age < userA.ageMin) {
      console.log(`❌ Age out of range: ${nameB} (${userB.age}) not within ${nameA}'s range (${userA.ageMin}–${userA.ageMax})`);
      return true;
    }
    return false;
  }
  const nameA = userA.displayName || userA.name || userA.uid;
  const nameB = userB.displayName || userB.name || userB.uid;

  if (userA.genderPref === "women" && userB.gender === "Man") {
    console.log(`❌ Gender mismatch: ${nameA} prefers women, but ${nameB} is a man`);
    return true;
  }
  if (userA.genderPref === "men" && userB.gender === "Woman") {
    console.log(`❌ Gender mismatch: ${nameA} prefers men, but ${nameB} is a woman`);
    return true;
  }
  if (userB.age > userA.ageMax || userB.age < userA.ageMin) {
    console.log(`❌ Age out of range: ${nameB} (${userB.age}) not within ${nameA}'s range (${userA.ageMin}–${userA.ageMax})`);
    return true;
  }
  if (userA.transPref === "0" && userB.isTrans === "yes") {
    console.log(`❌ Trans dealbreaker: ${nameA} does not want trans users, but ${nameB} is trans`);
    return true;
  }
  if (userA.transPref === "4" && userB.isTrans === "no") {
    console.log(`❌ Trans dealbreaker: ${nameA} only wants trans users, but ${nameB} is not trans`);
    return true;
  }
  if (userA.asexualPref === "0" && userB.isAsexual === "yes") {
    console.log(`❌ Asexual dealbreaker: ${nameA} does not want asexual users, but ${nameB} is`);
    return true;
  }
  if (userA.asexualPref === "4" && userB.isAsexual === "no") {
    console.log(`❌ Asexual dealbreaker: ${nameA} only wants asexual users, but ${nameB} is not`);
    return true;
  }

  const height = userB.selfHeight ?? 0;
  if (userA.heightDealbreaker === "3" && (height < userA.heightMin || height > userA.heightMax)) {
    console.log(`❌ Height dealbreaker: ${nameB}'s height (${height}) not within ${nameA}'s preferred range (${userA.heightMin}–${userA.heightMax})`);
    return true;
  }

  const racePref = arraySafe(userA.racePreferences);
  const theirRace = arraySafe(userB.races);
  if (userA.racePrefStrength === "3" && !racePref.some(r => theirRace.includes(r))) {
    console.log(`❌ Race dealbreaker: ${nameA}'s preferred races (${racePref}) do not include ${nameB}'s races (${theirRace})`);
    return true;
  }

  const religionPref = arraySafe(userA.religions);
  const theirReligion = arraySafe(userB.religions);
  if (userA.religionPref === "3" && !religionPref.some(r => theirReligion.includes(r))) {
    console.log(`❌ Religion dealbreaker: ${nameA}'s religions (${religionPref}) do not include any of ${nameB}'s (${theirReligion})`);
    return true;
  }

  if (userA.childrenPref === "3" && userA.children !== userB.children) {
    console.log(`❌ Children preference: ${nameA} wants ${userA.children}, ${nameB} has ${userB.children}`);
    return true;
  }

  if (userA.substancePref === "3" && userA.substances !== userB.substances) {
    console.log(`❌ Substance dealbreaker: ${nameA} wants ${userA.substances}, ${nameB} uses ${userB.substances}`);
    return true;
  }

  if (userA.politicsPref === "3" && userA.politics !== userB.politics) {
    console.log(`❌ Politics dealbreaker: ${nameA} is ${userA.politics}, ${nameB} is ${userB.politics}`);
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

  const sharedInterests = interestsA.filter(interest => interestsB.includes(interest));
  scoreA += sharedInterests.length * 3;
  scoreB += sharedInterests.length * 3;
  maxScoreA += interestsA.length * 3;
  maxScoreB += interestsB.length * 3;

  if (userA.hasReligionPref && userB.religions) {
  const prefs = arraySafe(userA.religions);
  const theirs = arraySafe(userB.religions);
  if (prefs.some(r => theirs.includes(r))) {
    scoreA += toNum(userA.religionPref) * 3;
  }
  maxScoreA += toNum(userA.religionPref) * 3;
}

  if (userB.hasReligionPref && userA.religions) {
  const prefs = arraySafe(userB.religions);
  const theirs = arraySafe(userA.religions);
  if (prefs.some(r => theirs.includes(r))) {
    scoreB += toNum(userB.religionPref) * 3;
  }
  maxScoreB += toNum(userB.religionPref) * 3;
}

  if (userA.hasRacePref && userB.races) {
  const prefs = arraySafe(userA.racePreferences);
  const theirs = arraySafe(userB.races);
  if (prefs.some(r => theirs.includes(r))) {
    scoreA += toNum(userA.racePrefStrength) * 3;
  }
  maxScoreA += toNum(userA.racePrefStrength) * 3;
}

  if (userB.hasRacePref && userA.races) {
  const prefs = arraySafe(userB.racePreferences);
  const theirs = arraySafe(userA.races);
  if (prefs.some(r => theirs.includes(r))) {
    scoreB += toNum(userB.racePrefStrength) * 3;
  }
  maxScoreB += toNum(userB.racePrefStrength) * 3;
}

  if (userA.hasHeightPref) {
    if (userA.heightMin < userB.selfHeight && userA.heightMax > userB.selfHeight) {
      scoreA += toNum(userA.heightDealbreaker) * 5;
    }
    maxScoreA += toNum(userA.heightDealbreaker) * 5;
  }
  if (userB.hasHeightPref) {
    if (userB.heightMin < userA.selfHeight && userB.heightMax > userA.selfHeight) {
      scoreB += toNum(userB.heightDealbreaker) * 5;
    }
    maxScoreB += toNum(userB.heightDealbreaker) * 5;
  }

  if (userA.children !== userB.children) {
    scoreA -= toNum(userA.childrenPref) * 2;
    scoreB -= toNum(userB.childrenPref) * 2;
  }

  if (userA.substances !== userB.substances) {
    scoreA -= toNum(userA.substancePref) * 2;
    scoreB -= toNum(userB.substancePref) * 2;
  }

  if (userA.politics !== userB.politics) {
    scoreA -= toNum(userA.politicsPref) * 2;
    scoreB -= toNum(userB.politicsPref) * 2;
  }

  if (userA.asexualPref === "1") {
    if (userB.isAsexual) scoreA -= 3;
  }
  if (userA.asexualPref === "3") {
    maxScoreA += 5;
    if (userB.isAsexual) scoreA += 5;
  }

  if (userB.asexualPref === "1") {
    if (userA.isAsexual) scoreB -= 3;
  }
  if (userB.asexualPref === "3") {
    maxScoreB += 5;
    if (userA.isAsexual) scoreB += 5;
  }

  if (userA.transPref === "1") {
    if (userB.isTrans) scoreA -= 3;
  }
  if (userA.transPref === "3") {
    maxScoreA += 5;
    if (userB.isTrans) scoreA += 5;
  }

  if (userB.transPref === "1") {
    if (userA.isTrans) scoreB -= 3;
  }
  if (userB.transPref === "3") {
    maxScoreB += 5;
    if (userA.isTrans) scoreB += 5;
  }

  const normalizedA = maxScoreA === 0 ? 1 : (scoreA / maxScoreA);
  const normalizedB = maxScoreB === 0 ? 1 : (scoreB / maxScoreB);
  const finalNormalizedScore = ((normalizedA + normalizedB) / 2) * 100;

  return {
    scoreA,
    maxScoreA,
    scoreB,
    maxScoreB,
    finalScore: Math.round(finalNormalizedScore)
  };
}

function arraySafe(val) {
  return Array.isArray(val) ? val : [];
}
