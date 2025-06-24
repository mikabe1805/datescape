import { db } from '../firebase';
import {
  collection, getDocs, query, doc, getDoc
} from 'firebase/firestore';
import { generateAndStoreMatch } from './matchStorage';
import { isIntentCompatible, failsDealbreakers, calculateMatchScore } from '../utils/MatchingEngine';

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
        ...(data.profile ?? {}),   // ← pull fields out of legacy ‘profile’ map
        ...data,                   // keep any already-flattened fields
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

        const pair = [currentUserProfile, candidate];
        pair.sort((a, b) => a.uid.localeCompare(b.uid));
        const [uA, uB] = pair;


        console.log(`🔍 Evaluating match: ${uA.displayName} (${uA.uid}) <--> ${uB.displayName} (${uB.uid})`);
        console.log(`  → Match ID: ${matchId}`);

        const matchRef = doc(db, "matches", matchId);

        const existingSnap = await getDoc(matchRef);

        if (existingSnap.exists()) {
          const match = existingSnap.data();
          if (!match.isActiveA && !match.isActiveB) {
            console.log(`Skipping match ${matchId} (both inactive)`);
            return;
          }
        }

      if (!isIntentCompatible(uA, uB)) {
        console.log(`❌ Skipped: ${uA.displayName} and ${uB.displayName} are intent-incompatible`);
        return;
      }
      if (failsDealbreakers(uA, uB)) {
        console.log(`❌ ${uA.displayName} fails ${uB.displayName}'s dealbreakers`);
        return;
      }
      if (failsDealbreakers(uB, uA)) {
        console.log(`❌ ${uB.displayName} fails ${uA.displayName}'s dealbreakers`);
        return;
      }

      console.log(`✅ Storing match: ${matchId}`);


      await generateAndStoreMatch(uA, uB);
      })
    );

    console.log("Finished generating matches");
  } catch (error) {
    console.error('Error generating matches:', error);
  }
}
