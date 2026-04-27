import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { auth, db } from "../firebase";
import { buildCombinedIds } from "../utils/MatchIds";

export default function AllMatchesPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const matchesQuery = query(
          collection(db, "matches"),
          where("participants", "array-contains", uid),
          where("matched", "==", true)
        );
        const snapshot = await getDocs(matchesQuery);
        const rows = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const otherUser = uid === data.userA ? data.userBProfile : data.userAProfile;
          return { id: docSnap.id, ...otherUser };
        });
        setMatches(rows);
      } catch (error) {
        console.error("Failed to fetch matches:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  if (loading) {
    return <p className="p-6 text-center text-amber-100">Loading...</p>;
  }

  if (matches.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a1511] p-6 pb-28 text-center text-amber-100">
        <p>No matches found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1511] p-4 pb-28 text-amber-100">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-2 text-sm text-amber-200/80 transition hover:text-amber-100"
      >
        <ArrowLeft size={18} /> Back
      </button>

      <h2 className="mb-4 text-center text-xl font-bold text-amber-50">All Matches</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {matches.map((match, index) => (
          <motion.div
            key={match.uid}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => navigate(`/app/match/${buildCombinedIds(match.uid, uid)}`)}
            className="cursor-pointer overflow-hidden rounded-[24px] border border-white/10 bg-white/7 shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all hover:bg-white/10"
          >
            <img
              src={match.media?.[0]}
              alt={match.displayName}
              className="aspect-[2/3] w-full border-b border-white/10 object-cover"
            />
            <div className="p-2 text-center">
              <p className="truncate font-semibold text-amber-50">{match.displayName}</p>
              <p className="text-xs text-amber-200/75">{match.age}</p>
              <p className="line-clamp-2 text-[0.65rem] text-white/60">
                {match.bio || "No bio yet."}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
