// pages/AllMatchesPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { buildCombinedIds } from "../utils/MatchIds";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react"; // or any icon

export default function AllMatchesPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const q = query(
          collection(db, "matches"),
          where("participants", "array-contains", uid),
          where("matched", "==", true)
        );
        const snap = await getDocs(q);

        const rows = snap.docs.map((doc) => {
          const data = doc.data();
          const other =
            uid === data.userA ? data.userBProfile : data.userAProfile;
          return { id: doc.id, ...other };
        });
        setMatches(rows);
      } catch (err) {
        console.error("Failed to fetch matches:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  if (loading) return <p className="p-6 text-center">Loading...</p>;
  if (matches.length === 0)
    return <p className="p-6 text-center">No matches found.</p>;

  return (
  <div className="p-4">
    <button
      onClick={() => navigate(-1)}
      className="flex items-center gap-2 text-sm text-gray-700 hover:text-emerald-800 mb-4"
    >
      <ArrowLeft size={18} /> Back
    </button>

    <h2 className="text-xl font-bold mb-4 text-center">All Matches</h2>

    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {matches.map((m, i) => (
        <motion.div
          key={m.uid}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          onClick={() =>
            navigate(`/app/match/${buildCombinedIds(m.uid, uid)}`)
          }
          className="cursor-pointer rounded-2xl bg-white/15 backdrop-blur-md border border-white/25
                     shadow-lg hover:shadow-xl transition-all overflow-hidden"
        >
          <img
            src={m.media?.[0]}
            alt={m.name}
            className="w-full aspect-[2/3] object-cover border-b border-white/20"
          />
          <div className="p-2 text-center">
            <p className="font-semibold text-emerald-900 truncate">{m.displayName}</p>
            <p className="text-xs text-emerald-800">{m.age}</p>
            <p className="text-[0.65rem] text-gray-700 line-clamp-2">
              {m.bio || "No bio yet."}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);
}
