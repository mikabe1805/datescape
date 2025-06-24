import { doc, setDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../firebase"; // Adjust path if needed
import { useEffect, useRef } from "react";

export function useTypingStatus(matchId, userId) {
  const typingTimeout = useRef(null);

  const handleTyping = () => {
    const typingRef = doc(db, `matches/${matchId}/typingStatus`, userId);
    setDoc(typingRef, { typing: true }, { merge: true });

    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      setDoc(typingRef, { typing: false }, { merge: true });
    }, 2000);
  };

  return handleTyping;
}

export function useListenToTyping(matchId, otherUserId, setIsTyping) {
  useEffect(() => {
    const typingRef = doc(db, `matches/${matchId}/typingStatus`, otherUserId);
    const unsubscribe = onSnapshot(typingRef, (docSnap) => {
      if (docSnap.exists()) {
        setIsTyping(docSnap.data().typing);
      } else {
        setIsTyping(false);
      }
    });

    return () => unsubscribe();
  }, [matchId, otherUserId, setIsTyping]);
}
