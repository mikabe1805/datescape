// pages/LikesPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  updateDoc,
  doc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { buildCombinedIds } from "../utils/MatchIds";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export default function LikesPage() {
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;

    const fetchLikes = async () => {
      try {
        const q = query(
          collection(db, "matches"),
          where("participants", "array-contains", uid)
        );
        const snap = await getDocs(q);
        const results = [];

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const isUserA = data.userA === uid;
          const likedByOther = isUserA ? data.likedByB : data.likedByA;
          const likedBySelf = isUserA ? data.likedByA : data.likedByB;
          const isActiveSelf = isUserA ? data.isActiveA : data.isActiveB;

          const showMatch =
            likedByOther === true &&
            likedBySelf === false &&
            isActiveSelf === true &&
            data.matched === false;

          if (showMatch) {
            results.push({
              matchId: docSnap.id,
              otherUser: isUserA ? data.userBProfile : data.userAProfile,
            });
          }
        });

        setLikes(results);
      } catch (err) {
        console.error("Error loading likes:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLikes();
  }, [uid]);

  const respondToLike = async (matchId, response) => {
    const ref = doc(db, "matches", matchId);
    const snap = await getDoc(ref);
    const data = snap.data();
    const isUserA = data.userA === uid;
    const likeField = isUserA ? "likedByA" : "likedByB";
    const activeField = isUserA ? "isActiveA" : "isActiveB";
    const otherLiked = isUserA ? data.likedByB : data.likedByA;

    const payload = {
      [likeField]: response === "like",
      [activeField]: false,
    };

    if (response === "like" && otherLiked) {
      payload.matched = true;
      payload.isActiveA = false;
      payload.isActiveB = false;
    }

    await updateDoc(ref, payload);
    setLikes((prev) => prev.filter((m) => m.matchId !== matchId));
  };

  if (loading) return <p className="p-6 text-center">Loading...</p>;
  if (likes.length === 0)
    return <p className="p-6 text-center">Nobody new has liked you yet 🥲</p>;

  return (
    <div className="p-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-700 hover:text-emerald-800 mb-4"
      >
        <ArrowLeft size={18} /> Back
      </button>

      <h2 className="text-xl font-bold mb-4 text-center">People Who Liked You</h2>

      <div className="flex flex-col gap-4 max-h-[calc(100vh-150px)] overflow-y-auto px-2">
        {likes.map(({ matchId, otherUser }, i) => (
            <motion.div
            key={otherUser.uid}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/25
                        shadow-lg hover:shadow-xl transition-all overflow-hidden flex flex-row items-center gap-4 p-4"
            >
            <img
                src={otherUser.media?.[0]}
                alt={otherUser.displayName}
                className="w-28 h-36 object-cover rounded-xl cursor-pointer"
                onClick={() =>
                navigate(`/app/match/${buildCombinedIds(otherUser.uid, uid)}`)
                }
            />

            <div className="flex-1">
                <p className="text-lg font-semibold text-emerald-900">
                {otherUser.displayName}, <span className="text-sm">{otherUser.age}</span>
                </p>
                <p className="text-sm text-gray-800 line-clamp-2 mt-1">
                {otherUser.bio || "No bio yet."}
                </p>

                <div className="flex gap-4 mt-3">
                <button
                    onClick={() => respondToLike(matchId, "like")}
                    className="text-pink-500 hover:text-pink-600 text-xl"
                    title="Like"
                >
                    ❤️
                </button>
                <button
                    onClick={() => respondToLike(matchId, "pass")}
                    className="text-red-500 hover:text-red-600 text-xl"
                    title="Pass"
                >
                    ❌
                </button>
                </div>
            </div>
            </motion.div>
        ))}
        </div>

      </div>
  );
}
