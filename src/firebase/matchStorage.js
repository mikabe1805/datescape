// --- matchStorage.js (stable version) ---

import { db, storage } from "../firebase";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  calculateMatchScore,
  distanceBetween,
  failsDealbreakers,
  isIntentCompatible,
} from "../utils/MatchingEngine";
import { stripSensitiveProfileFields, toMatchProfile } from "../utils/DataUtils";

export async function storeUserProfile(userId, profile, mediaFiles) {
  const mediaURLs = await uploadMediaFiles(userId, mediaFiles);
  const fullProfile = { ...stripSensitiveProfileFields(profile), media: mediaURLs };

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
    await uploadBytesResumable(fileRef, file);
    const url = await getDownloadURL(fileRef);
    urls.push(url);
  }
  return urls;
}

export async function generateAndStoreMatch(userA, userB) {
  // Data validation: skip if missing required fields
  const required = u => u && u.uid && (u.displayName || u.name) && u.age && u.gender && u.lookingFor && Array.isArray(u.media) && u.media.length > 0;
  if (!required(userA) || !required(userB)) {
    console.warn('Skipping match due to missing required user fields:', userA, userB);
    return;
  }
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

  const { finalScore } = calculateMatchScore(userA, userB);

  const existing = (await getDoc(matchRef)).data() || {};

  // 🔒 Preserve existing matched/like state
  const updatedMatch = {
    participants: [userA.uid, userB.uid],
    userA: userA.uid,
    userB: userB.uid,
    userAProfile: toMatchProfile(userA),
    userBProfile: toMatchProfile(userB),
    distanceMiles: distanceBetween(userA, userB),
    matchScore: finalScore,
    likedByA: existing.likedByA ?? false,
    likedByB: existing.likedByB ?? false,
    matched: existing.matched ?? ((existing.likedByA && existing.likedByB) || false),
    isActiveA: existing.isActiveA ?? true,
    isActiveB: existing.isActiveB ?? true,
    timestamp: serverTimestamp(),
  };

  await setDoc(matchRef, updatedMatch, { merge: true });

  console.log(`Match stored: ${matchId} with score ${finalScore}%`);
}
