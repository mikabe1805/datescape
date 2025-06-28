// --- matchStorage.js (stable version) ---

import { db, storage } from "../firebase";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
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
    await uploadBytesResumable(fileRef, file);
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

  function clean(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
  }

  const existing = (await getDoc(matchRef)).data() || {};

  // 🔒 Preserve existing matched/like state
  const updatedMatch = {
    participants: [userA.uid, userB.uid],
    userA: userA.uid,
    userB: userB.uid,
    userAProfile: clean(userA),
    userBProfile: clean(userB),
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
