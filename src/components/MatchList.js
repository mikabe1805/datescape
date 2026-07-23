import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { auth, db } from "../firebase";
import { buildCombinedIds } from "../utils/MatchIds";
import { otherProfileFromMatch } from "../utils/MatchProfiles";
import "../styles.css";

const PETAL_MOTION = Array.from({ length: 12 }, (_, index) => ({
  id: `p${index}`,
  duration: 18 + Math.random() * 8,
  delay: Math.random() * 12,
  startX: Math.random() * 100,
  drift: Math.random() * 20 - 10,
}));

export const UNREAD_PREVIEW_LIMIT = 100;
export const CONNECTION_PREVIEW_LIMIT = 24;

export function unreadPreviewLabel(count) {
  return count >= UNREAD_PREVIEW_LIMIT ? "99+" : String(count);
}

export default function MatchList() {
  const [matches, setMatches] = useState([]);
  const [chatPreviews, setChatPreviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const uid = auth.currentUser?.uid;
  const navigate = useNavigate();
  const subsRef = useRef({});
  const matchProfilesRef = useRef({});

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setLoadError("");

    const baseQuery = query(
      collection(db, "matches"),
      where("participants", "array-contains", uid),
      where("matched", "==", true),
      orderBy("timestamp", "desc"),
      limit(CONNECTION_PREVIEW_LIMIT),
    );

    const unsubscribeMatches = onSnapshot(
      baseQuery,
      (snapshot) => {
        setLoadError("");
        const activeIds = new Set();
        const rows = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const matchId = docSnap.id;
          const otherUser = otherProfileFromMatch(data, uid);
          activeIds.add(matchId);
          matchProfilesRef.current[matchId] = otherUser || {};

          if (!subsRef.current[matchId]) {
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
                const senderLabel =
                  lastMessageData.senderId === uid ? "You: " : "";
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

              setChatPreviews((current) => {
                const existing = current.find(
                  (item) => item.matchId === matchId,
                );
                const nextRow = {
                  ...matchProfilesRef.current[matchId],
                  matchId,
                  lastMsg,
                  lastTimestamp,
                  unreadCount: existing?.unreadCount || 0,
                  typing: existing?.typing || false,
                };
                const merged = existing
                  ? current.map((item) =>
                      item.matchId === matchId ? nextRow : item,
                    )
                  : [...current, nextRow];
                return merged.sort(
                  (first, second) =>
                    (second.lastTimestamp || 0) -
                    (first.lastTimestamp || 0),
                );
              });
            });

            const otherUid = uid === data.userA ? data.userB : data.userA;
            const typingRefDoc = doc(
              db,
              `matches/${matchId}/typingStatus`,
              otherUid,
            );
            const unsubTyping = onSnapshot(typingRefDoc, (typingSnap) => {
              const typingPreview = Boolean(typingSnap.data()?.typing);
              setChatPreviews((current) =>
                current.map((item) =>
                  item.matchId === matchId
                    ? {
                        ...item,
                        typing: typingPreview,
                      }
                    : item,
                ),
              );
            });

            const unreadQuery = query(
              collection(db, "matches", matchId, "messages"),
              where("senderId", "==", otherUid),
              where("isRead", "==", false),
              limit(UNREAD_PREVIEW_LIMIT)
            );
            const unsubUnread = onSnapshot(unreadQuery, (unreadSnap) => {
              const unreadCount = unreadSnap.docs.reduce(
                (count, unreadDoc) =>
                  unreadDoc.data()?.senderId !== uid ? count + 1 : count,
                0,
              );
              setChatPreviews((current) =>
                current.map((item) =>
                  item.matchId === matchId
                    ? { ...item, unreadCount }
                    : item,
                ),
              );
            });

            subsRef.current[matchId] = [
              unsubLast,
              unsubTyping,
              unsubUnread,
            ];
          }

          return { ...(otherUser || {}), matchId };
        });

        Object.entries(subsRef.current).forEach(([matchId, subscriptions]) => {
          if (activeIds.has(matchId)) return;
          subscriptions.forEach((unsubscribe) => unsubscribe?.());
          delete subsRef.current[matchId];
          delete matchProfilesRef.current[matchId];
        });

        setMatches(rows);
        setChatPreviews((current) => {
          const currentById = new Map(
            current.map((entry) => [entry.matchId, entry]),
          );
          return rows
            .map((row) => ({
              ...row,
              lastMsg: currentById.get(row.matchId)?.lastMsg || "No messages yet.",
              lastTimestamp:
                currentById.get(row.matchId)?.lastTimestamp || 0,
              unreadCount: currentById.get(row.matchId)?.unreadCount || 0,
              typing: currentById.get(row.matchId)?.typing || false,
            }))
            .sort(
              (first, second) =>
                (second.lastTimestamp || 0) - (first.lastTimestamp || 0),
            );
        });
        setLoading(false);
      },
      (error) => {
        console.error(error);
        Object.values(subsRef.current).forEach((subscriptions) => {
          if (!Array.isArray(subscriptions)) return;
          subscriptions.forEach((unsubscribe) => unsubscribe?.());
        });
        subsRef.current = {};
        matchProfilesRef.current = {};
        setMatches([]);
        setChatPreviews([]);
        setLoadError(
          "Your connections could not be loaded. Check your connection and try again.",
        );
        setLoading(false);
      },
    );

    return () => {
      unsubscribeMatches();
      Object.values(subsRef.current).forEach((subs) => {
        if (!Array.isArray(subs)) return;
        subs.forEach((unsubscribe) => {
          if (typeof unsubscribe === "function") unsubscribe();
        });
      });
      subsRef.current = {};
      matchProfilesRef.current = {};
    };
  }, [uid, retryAttempt]);

  if (loading) return <p className="p-8 text-center text-amber-200">Loading...</p>;
  if (loadError) {
    return (
      <main className="min-h-screen bg-[#07120e] px-5 pb-32 pt-16 text-amber-100">
        <section
          className="mx-auto grid max-w-xl justify-items-center rounded-[28px] border border-amber-200/15 bg-white/5 p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-11"
          role="alert"
        >
          <img
            src="/afterlight-icon-192.png"
            alt=""
            className="h-14 w-14 opacity-80"
          />
          <h1 className="mt-5 font-[Playfair_Display] text-3xl text-amber-50">
            Connections are out of reach.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/65">
            {loadError}
          </p>
          <button
            type="button"
            className="mt-7 rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-[#10201a] transition hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
            onClick={() => setRetryAttempt((attempt) => attempt + 1)}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }
  if (matches.length === 0) {
    return (
      <main className="min-h-screen bg-[#07120e] px-5 pb-32 pt-16 text-amber-100">
        <section className="mx-auto grid max-w-xl justify-items-center rounded-[28px] border border-amber-200/15 bg-white/5 p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-11">
          <img
            src="/afterlight-icon-192.png"
            alt=""
            className="h-14 w-14 opacity-80"
          />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">
            Connections
          </p>
          <h1 className="mt-3 font-[Playfair_Display] text-3xl text-amber-50">
            No mutual Sparks yet.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/65">
            Share a Listening Crescent prompt or a Resonance duet in
            Afterlight. One-way interest stays private; a mutual Spark will
            appear here.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-[#10201a] transition hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
              onClick={() => navigate("/app/explore")}
            >
              Enter Afterlight
            </button>
            <button
              type="button"
              className="rounded-2xl border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
              onClick={() => navigate("/app/match-queue")}
            >
              Browse introductions
            </button>
          </div>
        </section>
      </main>
    );
  }

  const renderMatchCard = (match, index) => (
    <motion.button
      type="button"
      key={match.matchId}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={() => navigate(`/app/match/${buildCombinedIds(match.uid, uid)}`)}
      className="relative z-40 flex w-[140px] flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-amber-200/20 bg-white/10 text-left shadow-lg backdrop-blur-lg transition hover:-translate-y-1 hover:shadow-amber-300/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 sm:w-[160px]"
    >
      <img src={match.media?.[0]} alt={match.displayName} className="aspect-[2/3] w-full object-cover" loading="lazy" />
      <div className="p-2 text-center">
        <p className="truncate font-medium text-amber-200 drop-shadow">{match.displayName}</p>
      </div>
    </motion.button>
  );

  const renderViewAllCard = () => (
    <motion.button
      type="button"
      key="view-all"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: matches.length * 0.03 }}
      onClick={() => navigate("/app/matches/all")}
      className="relative z-40 flex w-[140px] flex-shrink-0 flex-col items-center justify-center rounded-2xl border border-amber-200/20 bg-white/10 shadow-lg backdrop-blur-lg transition hover:-translate-y-1 hover:shadow-amber-300/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 sm:w-[160px]"
    >
      <Plus size={38} aria-hidden="true" />
      <p className="mt-1 text-xs text-amber-200">View all</p>
    </motion.button>
  );

  const petals = PETAL_MOTION.map(({ id, duration, delay, startX, drift }) => (
    <motion.img
      key={id}
      src="/overlays/petal.png"
      alt=""
      className="pointer-events-none fixed top-0 z-10 h-24 w-24 object-contain opacity-70"
      style={{ left: `${startX}vw` }}
      initial={{ y: 0, x: 0, rotate: 0 }}
      animate={{ y: "110vh", x: `${drift}vw`, rotate: 360 }}
      transition={{ delay, duration, repeat: Infinity, ease: "linear" }}
    />
  ));

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
          Connections
        </h1>
        <div className="mt-8 px-4">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-amber-400/60">
            {matches
              .slice(0, 10)
              .map((match, index) => renderMatchCard(match, index))}
            {matches.length > 10 && renderViewAllCard()}
          </div>
        </div>

        <h2 className="candle-glow mb-4 mt-12 text-center font-[Playfair_Display] text-2xl text-amber-300">
          Active Chats
        </h2>
        <div className="flex flex-col gap-4 px-4">
          {chatPreviews.map((chat) => (
            <motion.button
              type="button"
              key={chat.matchId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
              onClick={() => navigate(`/app/chat/${chat.matchId}`)}
              className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-amber-200/20 bg-white/5 p-4 text-left backdrop-blur-md transition-transform hover:scale-[1.02] hover:bg-white/10 hover:shadow-amber-300/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
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
                <p className="truncate text-sm italic text-amber-100/90">
                  {chat.typing ? "typing..." : chat.lastMsg}
                </p>
              </div>
              {chat.unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-amber-400 px-2 py-1 text-xs font-semibold text-black">
                  {unreadPreviewLabel(chat.unreadCount)}
                </span>
              )}
            </motion.button>
          ))}
        </div>
      </main>
    </div>
  );
}
