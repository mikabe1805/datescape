// --- generateMatchesForUser.js (fully flattened version) ---

import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import { generateAndStoreMatch } from './matchStorage';

export async function generateMatchesForUser(currentUserProfile, currentUserId) {
  try {
    console.log("Starting match generation for:", currentUserId);

    const usersSnapshot = await getDocs(query(collection(db, 'users')));
    const allUsers = [];

    usersSnapshot.forEach(doc => {
      if (doc.id !== currentUserId) {
        const data = doc.data();
        // Flatten nested profiles if they exist
        const flattened = {
          uid: doc.id,
          ...(data.profile ? data.profile : data)
        };
        allUsers.push(flattened);
      }
    });

    console.log("Found", allUsers.length, "candidates");

    await Promise.all(
      allUsers.map(candidate => {
        console.log("Comparing:", currentUserId, "vs", candidate.uid);
        return generateAndStoreMatch(currentUserProfile, candidate);
      })
    );

    console.log("Finished generating matches");
  } catch (error) {
    console.error('Error generating matches:', error);
  }
}
