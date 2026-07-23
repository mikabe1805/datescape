import { deleteDoc, doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useEffect, useRef } from "react";

export function useTypingStatus(matchId, userId) {
  const typingTimeout = useRef(null);

  const handleTyping = () => {
    if (!matchId || !userId) return;
    const typingRef = doc(db, `matches/${matchId}/typingStatus`, userId);
    void Promise.resolve(setDoc(typingRef, { typing: true })).catch(() => {});

    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      void Promise.resolve(setDoc(typingRef, { typing: false })).catch(
        () => {},
      );
    }, 2000);
  };

  useEffect(
    () => () => {
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
        typingTimeout.current = null;
      }
      if (!matchId || !userId) return;
      const typingRef = doc(db, `matches/${matchId}/typingStatus`, userId);
      // Deletion remains valid after an unmatch/block so stale typing state can
      // be cleaned up without allowing any new post-connection activity.
      void Promise.resolve(deleteDoc(typingRef)).catch(() => {});
    },
    [matchId, userId],
  );

  return handleTyping;
}

export function useListenToTyping(matchId, otherUserId, setIsTyping) {
  useEffect(() => {
    if (!matchId || !otherUserId) {
      setIsTyping(false);
      return undefined;
    }
    const typingRef = doc(db, `matches/${matchId}/typingStatus`, otherUserId);
    const unsubscribe = onSnapshot(typingRef, (docSnap) => {
      if (docSnap.exists()) {
        setIsTyping(docSnap.data().typing === true);
      } else {
        setIsTyping(false);
      }
    });

    return () => unsubscribe();
  }, [matchId, otherUserId, setIsTyping]);
}
