import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { auth, db } from "../firebase";
import { buildCombinedIds } from "../utils/MatchIds";
import "../styles.css";

export default function MatchList() {
  const [matches, setMatches] = useState([]);
  const [chatPreviews, setChatPreviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;
  const navigate = useNavigate();
  const subsRef = useRef({});

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }

    const baseQuery = query(
      collection(db, "matches"),
      where("participants", "array-contains", uid),
      where("matched", "==", true)
    );

    const localSubs = subsRef.current;

    (async () => {
      try {
        const snapshot = await getDocs(baseQuery);
        const rows = await Promise.all(
          snapshot.docs.map(async (docSnap) => {
            const data = docSnap.data();
            const matchId = docSnap.id;
            const otherUser = uid === data.userA ? data.userBProfile : data.userAProfile;

            if (!localSubs[matchId]) {
              const messagesQuery = query(
                collection(db, "matches", matchId, "messages"),
                orderBy("timestamp", "desc"),
                limit(1)
              );

              const unsubLast = onSnapshot(messagesQuery, (messageSnap) => {
                const lastMessageData = messageSnap.docs[0]?.data();
                let lastMsg = "No messages yet.";
                let lastTimestamp = 0;

                if (lastMessageData) {
                  lastTimestamp = lastMessageData.timestamp?.seconds || 0;
                  const senderLabel = lastMessageData.senderId === uid ? "You: " : "";
                  switch (lastMessageData.type) {
                    case "text":
                      lastMsg = `${senderLabel}${lastMessageData.text}`;
                      break;
                    case "image":
                      lastMsg = `${senderLabel}Photo`;
                      break;
                    case "audio":
                      lastMsg = `${senderLabel}Voice message`;
                      break;
                    default:
                      lastMsg = `${senderLabel}New message`;
                  }
                }

                setChatPreviews((prev) => {
                  const existing = prev.some((item) => item.matchId === matchId);
                  const nextRow = {
                    ...otherUser,
                    matchId,
                    lastMsg,
                    lastTimestamp,
                    unreadCount: prev.find((item) => item.matchId === matchId)?.unreadCount || 0
                  };
                  const merged = existing
                    ? prev.map((item) => (item.matchId === matchId ? nextRow : item))
                    : [...prev, nextRow];
                  merged.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
                  return merged;
                });
              });

              const typingRefPathUser = uid === data.userA ? data.userB : data.userA;
              const typingRefDoc = doc(db, `matches/${matchId}/typingStatus`, typingRefPathUser);
              const unsubTyping = onSnapshot(typingRefDoc, (typingSnap) => {
                const typingPreview = Boolean(typingSnap.data()?.typing);
                setChatPreviews((prev) =>
                  prev.map((item) =>
                    item.matchId === matchId
                      ? { ...item, lastMsg: typingPreview ? "typing..." : item.lastMsg }
                      : item
                  )
                );
              });

              const unreadQuery = query(
                collection(db, "matches", matchId, "messages"),
                where("isRead", "==", false)
              );
              const unsubUnread = onSnapshot(unreadQuery, (unreadSnap) => {
                const unreadCount = unreadSnap.docs.reduce((count, unreadDoc) => {
                  return unreadDoc.data()?.senderId !== uid ? count + 1 : count;
                }, 0);
                setChatPreviews((prev) =>
                  prev.map((item) => (item.matchId === matchId ? { ...item, unreadCount } : item))
                );
              });

              localSubs[matchId] = [unsubLast, unsubTyping, unsubUnread];
            }

            return { ...otherUser, matchId };
          })
        );

        setMatches(rows);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      Object.values(subsRef.current).forEach((subs) => {
        if (!Array.isArray(subs)) return;
        subs.forEach((unsubscribe) => {
          if (typeof unsubscribe === "function") unsubscribe();
        });
      });
      subsRef.current = {};
    };
  }, [uid]);

  if (loading) return <p className="p-8 text-center text-amber-200">Loading...</p>;
  if (matches.length === 0) return <p className="p-8 text-center text-amber-200">No matches yet.</p>;

  const MatchCard = (match, index) => (
    <motion.article
      key={match.uid}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={() => navigate(`/app/match/${buildCombinedIds(match.uid, uid)}`)}
      className="relative z-40 flex w-[140px] flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-amber-200/20 bg-white/10 shadow-lg backdrop-blur-lg transition hover:-translate-y-1 hover:shadow-amber-300/40 sm:w-[160px]"
    >
      <img src={match.media?.[0]} alt={match.displayName} className="aspect-[2/3] w-full object-cover" loading="lazy" />
      <div className="p-2 text-center">
        <p className="truncate font-medium text-amber-200 drop-shadow">{match.displayName}</p>
      </div>
    </motion.article>
  );

  const ViewAllCard = () => (
    <motion.article
      key="view-all"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: matches.length * 0.03 }}
      onClick={() => navigate("/app/matches/all")}
      className="relative z-40 flex w-[140px] flex-shrink-0 flex-col items-center justify-center rounded-2xl border border-amber-200/20 bg-white/10 shadow-lg backdrop-blur-lg transition hover:-translate-y-1 hover:shadow-amber-300/40 sm:w-[160px]"
    >
      <div className="text-4xl">+</div>
      <p className="mt-1 text-xs text-amber-200">View all</p>
    </motion.article>
  );

  const petals = Array.from({ length: 12 }).map((_, index) => {
    const duration = 18 + Math.random() * 8;
    const delay = Math.random() * 12;
    const startX = Math.random() * 100;
    const drift = Math.random() * 20 - 10;
    return (
      <motion.img
        key={`p${index}`}
        src="/overlays/petal.png"
        alt="petal"
        className="pointer-events-none fixed top-0 z-10 h-24 w-24 object-contain opacity-70"
        style={{ left: `${startX}vw` }}
        initial={{ y: 0, x: 0, rotate: 0 }}
        animate={{ y: "110vh", x: `${drift}vw`, rotate: 360 }}
        transition={{ delay, duration, repeat: Infinity, ease: "linear" }}
      />
    );
  });

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07120e] font-[Source_Sans_3] text-amber-100">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_60%,#050d09_100%)]" />
        <div className="absolute -top-10 left-1/3 h-96 w-96 rounded-full bg-amber-400/22 blur-3xl animate-pulse-slow" />
        <div className="absolute right-1/4 top-40 h-80 w-80 rounded-full bg-amber-300/22 blur-3xl animate-pulse-slower" />
      </div>
      {petals}
      <img src="/overlays/cherry2.png" alt="" className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[2200px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-60 mix-blend-screen" />

      <main className="relative z-40 pb-36">
        <h1 className="candle-glow pt-10 text-center font-[Playfair_Display] text-4xl font-bold tracking-wide text-amber-200">
          Matches
        </h1>
        <div className="mt-8 px-4">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-amber-400/60">
            {matches.slice(0, 10).map((match, index) => MatchCard(match, index))}
            {matches.length > 10 && ViewAllCard()}
          </div>
        </div>

        <h2 className="candle-glow mb-4 mt-12 text-center font-[Playfair_Display] text-2xl text-amber-300">
          Active Chats
        </h2>
        <div className="flex flex-col gap-4 px-4">
          {chatPreviews.map((chat) => (
            <motion.div
              key={chat.matchId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
              onClick={() => navigate(`/app/chat/${chat.matchId}`)}
              className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-amber-200/20 bg-white/5 p-4 backdrop-blur-md transition-transform hover:scale-[1.02] hover:bg-white/10 hover:shadow-amber-300/30"
            >
              <img
                src={chat.media?.[0]}
                alt={chat.displayName || chat.name}
                className="h-12 w-12 rounded-full border border-amber-300/30 object-cover"
              />
              <div className="flex-grow">
                <p className="truncate font-semibold text-amber-200 drop-shadow-sm">
                  {chat.displayName || chat.name}
                </p>
                <p className="truncate text-sm italic text-amber-100/90">{chat.lastMsg}</p>
              </div>
              {chat.unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-amber-400 px-2 py-1 text-xs font-semibold text-black">
                  {chat.unreadCount}
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
