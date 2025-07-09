// MatchList.js – Improved interactivity & visuals
import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
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

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const baseQ = query(
          collection(db, "matches"),
          where("participants", "array-contains", uid),
          where("matched", "==", true)
        );
        const snap = await getDocs(baseQ);
        const rows = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            const matchId = d.id;
            const other = uid === data.userA ? data.userBProfile : data.userAProfile;
            const chatSnap = await getDocs(
              query(
                collection(db, "matches", matchId, "messages"),
                orderBy("timestamp", "desc"),
                limit(1)
              )
            );
            const lastMessageData = chatSnap.docs[0]?.data();
            let lastMsg = "No messages yet.";
            let lastTimestamp = 0;
            if (lastMessageData) {
              lastTimestamp = lastMessageData.timestamp?.seconds || 0;
              const senderLabel = lastMessageData.senderId === auth.currentUser.uid ? "You: " : "";
              switch (lastMessageData.type) {
                case "text":
                  lastMsg = `${senderLabel}${lastMessageData.text}`;
                  break;
                case "image":
                  lastMsg = `${senderLabel}📷 Photo`;
                  break;
                case "audio":
                  lastMsg = `${senderLabel}🎙️ Voice message`;
                  break;
                default:
                  lastMsg = `${senderLabel}New message`;
              }
            }
            return { ...other, matchId, lastMsg, lastTimestamp };
          })
        );
        // Sort by most recent message timestamp (descending)
        rows.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
        setMatches(rows);
        setChatPreviews(rows);
      } catch (err) {
        console.error(err);

      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  if (loading) return <p className="p-8 text-center text-amber-200">Loading…</p>;
  if (matches.length === 0) return <p className="p-8 text-center text-amber-200">No matches yet 😢</p>;

  const MatchCard = (m, i) => (
    <motion.article
      key={m.uid}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.03 }}
      onClick={() => navigate(`/app/match/${buildCombinedIds(m.uid, uid)}`)}
      className="relative flex-shrink-0 w-[140px] sm:w-[160px] flex flex-col overflow-hidden rounded-2xl bg-white/10 backdrop-blur-lg border border-amber-200/20 shadow-lg hover:shadow-amber-300/40 hover:-translate-y-1 transition cursor-pointer z-40"
    >
      <img src={m.media?.[0]} alt={m.displayName} className="w-full aspect-[2/3] object-cover" />
      <div className="p-2 text-center">
        <p className="font-medium text-amber-200 drop-shadow truncate">{m.displayName}</p>
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
      className="relative flex-shrink-0 w-[140px] sm:w-[160px] flex flex-col items-center justify-center rounded-2xl bg-white/10 backdrop-blur-lg border border-amber-200/20 shadow-lg hover:shadow-amber-300/40 hover:-translate-y-1 transition cursor-pointer z-40"
    >
      <div className="text-4xl">📂</div>
      <p className="text-xs mt-1 text-amber-200">View all</p>
    </motion.article>
  );

  const petals = Array.from({ length: 12 }).map((_, i) => {
    const duration = 18 + Math.random() * 8;
    const delay = Math.random() * 12;
    const startX = Math.random() * 100;
    const drift = Math.random() * 20 - 10;
    return (
      <motion.img
        key={`p${i}`}
        src="/overlays/petal.png"
        alt="petal"
        className="pointer-events-none fixed top-0 w-24 h-24 object-contain opacity-70 z-10"
        style={{ left: `${startX}vw` }}
        initial={{ y: 0, x: 0, rotate: 0 }}
        animate={{ y: '110vh', x: `${drift}vw`, rotate: 360 }}
        transition={{ delay, duration, repeat: Infinity, ease: 'linear' }}
      />
    );
  });

  return (
    <div className="relative min-h-screen overflow-hidden font-[Source_Sans_3] bg-[#0a1511] text-amber-100">
      {/* Visual Overlays (non-interactive) */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_60%,#0a1511_100%)]" />
        <div className="absolute -top-10 left-1/3 w-96 h-96 bg-amber-400/25 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-amber-300/25 rounded-full blur-3xl animate-pulse-slower" />
      </div>
      {petals}
      <img src="/overlays/cherry2.png" alt="" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[2200px] max-w-none opacity-80 pointer-events-none z-10" />

      {/* Main Content */}
      <main className="relative z-40 pb-36">
        <h1 className="text-4xl font-[Playfair_Display] font-bold text-center pt-10 text-amber-200 candle-glow tracking-wide">
          Matches
        </h1>
        <div className="mt-8 px-4">
          <div className="flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-amber-400/60 pb-2">
            {matches.slice(0, 10).map((m, i) => MatchCard(m, i))}
            {matches.length > 10 && ViewAllCard()}
          </div>
        </div>

        <h2 className="mt-12 mb-4 text-2xl font-[Playfair_Display] text-center text-amber-300 candle-glow">
          Active Chats
        </h2>
        <div className="flex flex-col gap-4 px-4">
          {chatPreviews.map((chat) => (
            <motion.div
              key={chat.matchId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 200 }}
              onClick={() => navigate(`/app/chat/${chat.matchId}`)}
              className="group flex items-center gap-4 p-4 bg-white/5 rounded-2xl backdrop-blur-md border border-amber-200/20 hover:bg-white/10 cursor-pointer transition-transform hover:scale-[1.02] hover:shadow-amber-300/30"
            >
              <img src={chat.media?.[0]} alt={chat.name} className="w-12 h-12 rounded-full object-cover border border-amber-300/30" />
              <div className="flex-grow">
                <p className="font-semibold text-amber-200 drop-shadow-sm truncate">
                  {chat.name}
                </p>
                <p className="text-sm text-amber-100/90 italic truncate">
                  {chat.lastMsg}
                </p>
              </div>
              <svg className="w-5 h-5 text-amber-300 opacity-0 group-hover:opacity-100 transition" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8 2 2 6 2 12c6 0 10-4 10-10Z" />
                <path d="M22 12C22 6 16 2 12 2c0 6 4 10 10 10Z" />
              </svg>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}