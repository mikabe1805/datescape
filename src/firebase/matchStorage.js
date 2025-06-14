import { db, serverTimestamp } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Generate match ID that avoids duplication (alphabetical order of UIDs)
function generateMatchId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

// Store match result into Firestore
export async function storeMatchResult(userAId, userBId, matchScore, candidateProfile) {
  const matchId = generateMatchId(userAId, userBId);
  const matchRef = doc(db, 'matches', matchId);

  const existingDoc = await getDoc(matchRef);
  if (existingDoc.exists()) {
    console.log("Match already exists, skipping.");
    return;
  }

  const matchData = {
    userA: userAId,
    userB: userBId,
    userBProfile: candidateProfile,  // here we store their full profile snapshot
    matchScore,
    likedByA: false,
    likedByB: false,
    matched: false,
    timestamp: serverTimestamp()
  };

  await setDoc(matchRef, matchData);
  console.log("Match stored successfully.");
}
