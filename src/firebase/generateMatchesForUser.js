import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { calculateMatchScore, isIntentCompatible, failsDealbreakers } from '../utils/MatchingEngine';
import { storeMatchResult } from './matchStorage';

export async function generateMatchesForUser(currentUserId) {
  const snapshot = await getDocs(collection(db, "users"));
  const currentUserDoc = snapshot.docs.find(doc => doc.id === currentUserId);
  const currentUserData = currentUserDoc.data().profile;

  const otherUsers = snapshot.docs
    .filter(doc => doc.id !== currentUserId)
    .map(doc => ({ uid: doc.id, ...doc.data().profile }));

  const filteredUsers = otherUsers.filter(candidate => 
    isIntentCompatible(currentUserData, candidate)
  ).filter(candidate =>
    !failsDealbreakers(currentUserData, candidate)
  );

  for (const candidate of filteredUsers) {
  const score = calculateMatchScore(currentUserData, candidate);
  if (score >= 0) {
    await storeMatchResult(currentUserId, candidate.uid, score, candidate);
  }
}
}
