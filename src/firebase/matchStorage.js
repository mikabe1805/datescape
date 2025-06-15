// --- matchStorage.js (stable version) ---

import { db, storage } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { calculateMatchScore, failsDealbreakers, isIntentCompatible } from "../utils/MatchingEngine";

export async function storeUserProfile(userId, profile, mediaFiles) {
  const mediaURLs = await uploadMediaFiles(userId, mediaFiles);
  const fullProfile = { ...profile, media: mediaURLs };

  // FLATTEN storage (NO nested 'profile' field anymore)
  await setDoc(doc(db, "users", userId), {
    uid: userId,
    ...fullProfile,
    createdAt: serverTimestamp()
  });
}

async function uploadMediaFiles(userId, mediaFiles) {
  const urls = [];
  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    const fileRef = ref(storage, `userMedia/${userId}/media_${i}_${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    urls.push(url);
  }
  return urls;
}

export async function generateAndStoreMatch(userA, userB) {
  const matchId = [userA.uid, userB.uid].sort().join("_");
  const matchRef = doc(db, "matches", matchId);

  if (!isIntentCompatible(userA, userB)) {
    console.log("Intents incompatible, skipping match.");
    return;
  }

  if (failsDealbreakers(userA, userB) || failsDealbreakers(userB, userA)) {
    console.log("Dealbreakers triggered, skipping match.");
    return;
  }

  const { scoreA, maxScoreA, scoreB, maxScoreB, finalScore } = calculateMatchScore(userA, userB);

  await setDoc(matchRef, {
    participants: [userA.uid, userB.uid],
    userA: userA.uid,
    userB: userB.uid,
    userAProfile: userA,   // fully flattened profiles
    userBProfile: userB,
    matchScore: finalScore,
    likedByA: false,
    likedByB: false,
    matched: false,
    isActive: true,
    timestamp: serverTimestamp()
  });

  console.log(`Match stored: ${matchId} with score ${finalScore}%`);
}
