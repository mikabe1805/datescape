import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, X } from "lucide-react";
import { auth, db } from "../firebase";
import { buildCombinedIds } from "../utils/MatchIds";
import { submitMatchDecision } from "../utils/MatchActions";

export default function LikesPage() {
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingMatchId, setRespondingMatchId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const fetchLikes = async () => {
      try {
        const likesQuery = query(
          collection(db, "matches"),
          where("participants", "array-contains", uid)
        );
        const snapshot = await getDocs(likesQuery);
        const results = [];

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const isUserA = data.userA === uid;
          const likedByOther = isUserA ? data.likedByB : data.likedByA;
          const likedBySelf = isUserA ? data.likedByA : data.likedByB;
          const isActiveSelf = isUserA ? data.isActiveA : data.isActiveB;

          if (likedByOther && !likedBySelf && isActiveSelf && !data.matched) {
            results.push({
              matchId: docSnap.id,
              otherUser: isUserA ? data.userBProfile : data.userAProfile
            });
          }
        });

        setLikes(results);
      } catch (error) {
        console.error("Error loading likes:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLikes();
  }, [uid]);

  const respondToLike = async (matchId, response) => {
    if (respondingMatchId) return;
    setRespondingMatchId(matchId);
    setActionError(null);
    try {
      await submitMatchDecision(matchId, response);
      setLikes((prev) => prev.filter((item) => item.matchId !== matchId));
    } catch (error) {
      console.warn("Like response failed", error);
      setActionError(
        "That response could not be saved. Check your connection and try again.",
      );
    } finally {
      setRespondingMatchId(null);
    }
  };

  if (loading) {
    return <p className="p-6 text-center text-amber-100">Loading...</p>;
  }

  if (likes.length === 0) {
    return (
      <div className="min-h-screen bg-[#07120e] px-4 pb-28 pt-6 text-amber-100">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-sm text-amber-200/80 transition hover:text-amber-100"
        >
          <ArrowLeft size={18} /> Back
        </button>

        <div className="mx-auto max-w-xl rounded-[28px] border border-white/10 bg-white/6 p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">Likes</p>
          <h2 className="mt-3 text-2xl font-semibold text-amber-50">Nothing queued here yet.</h2>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Keep moving through the queue and tighten the profile details that matter. New likes will appear here as soon as someone hits back.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => navigate("/app/match-queue")}
              className="rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-[#10201a] transition hover:bg-amber-200"
            >
              Open Match Queue
            </button>
            <button
              onClick={() => navigate("/app/profile")}
              className="rounded-2xl border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-white/12"
            >
              Edit Profile
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07120e] p-4 pb-28 text-amber-100">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-2 text-sm text-amber-200/80 transition hover:text-amber-100"
      >
        <ArrowLeft size={18} /> Back
      </button>

      <h2 className="candle-glow mb-4 text-center text-xl font-bold text-amber-50">People Who Liked You</h2>
      {actionError ? (
        <p className="mx-auto mb-4 max-w-xl text-center text-sm text-rose-200" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 px-2">
        {likes.map(({ matchId, otherUser }, index) => (
          <motion.div
            key={matchId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="flex flex-row items-center gap-4 overflow-hidden rounded-[26px] border border-white/10 bg-white/7 p-4 shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all hover:bg-white/10"
          >
            <img
              src={otherUser.media?.[0]}
              alt={otherUser.displayName}
              className="h-36 w-28 cursor-pointer rounded-xl object-cover"
              loading="lazy"
              onClick={() => navigate(`/app/match/${buildCombinedIds(otherUser.uid, uid)}`)}
            />

            <div className="flex-1">
              <p className="text-lg font-semibold text-amber-50">
                {otherUser.displayName}, <span className="text-sm text-amber-200/75">{otherUser.age}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-white/65">
                {otherUser.bio || "No bio yet."}
              </p>

              <div className="mt-3 flex gap-4">
                <button
                  onClick={() => respondToLike(matchId, "like")}
                  disabled={Boolean(respondingMatchId)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/18 text-emerald-200 transition hover:bg-emerald-400/26"
                  title="Like back"
                >
                  <Heart size={18} fill="currentColor" />
                </button>
                <button
                  onClick={() => respondToLike(matchId, "pass")}
                  disabled={Boolean(respondingMatchId)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-400/18 text-rose-200 transition hover:bg-rose-400/26"
                  title="Pass"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
