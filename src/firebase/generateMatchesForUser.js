import { db } from '../firebase';
import {
  collection, getDocs, query, doc, getDoc
} from 'firebase/firestore';
import { generateAndStoreMatch } from './matchStorage';

export async function generateMatchesForUser(currentUserProfile, currentUserId) {
  try {
    if (!currentUserProfile || !currentUserId) {
      console.warn("Invalid currentUserProfile or ID:", currentUserProfile, currentUserId);
      return;
    }

    console.log("Starting match generation for:", currentUserId);

    const usersSnapshot = await getDocs(query(collection(db, 'users')));
    const allUsers = [];

    usersSnapshot.forEach(docSnap => {
      if (docSnap.id !== currentUserId) {
        const data = docSnap.data();
        const flattened = {
          uid: docSnap.id,
          ...data, // ✅ pulls from full user doc
        };
        allUsers.push(flattened);
      }
    });

    console.log("Found", allUsers.length, "candidates");

    await Promise.all(
      allUsers.map(async candidate => {
        const candidateId = candidate.uid;
        if (candidateId === currentUserId) return; // Skip self

        // ✅ Prevent overwriting old or inactive matches
        const [id1, id2] = [currentUserId, candidateId].sort();
        const matchId = `${id1}_${id2}`;
        const matchRef = doc(db, "matches", matchId);
        const existingSnap = await getDoc(matchRef);

        if (existingSnap.exists()) {
          const match = existingSnap.data();
          if (!match.isActiveA && !match.isActiveB) {
            console.log(`Skipping match ${matchId} (both inactive)`);
            return;
          }
        }

        console.log("Comparing:", currentUserId, "vs", candidateId);
        await generateAndStoreMatch(currentUserProfile, candidate);
      })
    );

    console.log("Finished generating matches");
  } catch (error) {
    console.error('Error generating matches:', error);
  }
}
