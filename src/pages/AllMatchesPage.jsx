import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { auth, db } from "../firebase";
import { buildCombinedIds } from "../utils/MatchIds";
import { otherProfileFromMatch } from "../utils/MatchProfiles";

export const CONNECTION_PAGE_SIZE = 50;

function connectionRow(docSnap, uid) {
  const otherUser = otherProfileFromMatch(docSnap.data(), uid);
  return otherUser ? { id: docSnap.id, ...otherUser } : null;
}

function mergeConnections(primary, older) {
  const rows = new Map();
  [...primary, ...older].forEach((row) => {
    if (row?.id && !rows.has(row.id)) rows.set(row.id, row);
  });
  return [...rows.values()];
}

export default function AllMatchesPage() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [olderMatches, setOlderMatches] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const loadedOlderRef = useRef(false);
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;
  const matches = useMemo(
    () => mergeConnections(liveMatches, olderMatches),
    [liveMatches, olderMatches],
  );

  const baseConstraints = useCallback(
    () => [
      where("participants", "array-contains", uid),
      where("matched", "==", true),
      orderBy("timestamp", "desc"),
    ],
    [uid],
  );

  useEffect(() => {
    setLiveMatches([]);
    setOlderMatches([]);
    setCursor(null);
    setHasMore(false);
    setError("");
    loadedOlderRef.current = false;
    if (!uid) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const matchesQuery = query(
      collection(db, "matches"),
      ...baseConstraints(),
      limit(CONNECTION_PAGE_SIZE),
    );
    return onSnapshot(
      matchesQuery,
      (snapshot) => {
        setLiveMatches(
          snapshot.docs.map((docSnap) => connectionRow(docSnap, uid)).filter(Boolean),
        );
        if (!loadedOlderRef.current) {
          setCursor(snapshot.docs.at(-1) || null);
          setHasMore(snapshot.docs.length === CONNECTION_PAGE_SIZE);
        }
        setError("");
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Failed to fetch connections:", snapshotError);
        setError("Connections are unavailable right now. Try again in a moment.");
        setLoading(false);
      },
    );
  }, [baseConstraints, uid]);

  const loadOlder = useCallback(async () => {
    if (!uid || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "matches"),
          ...baseConstraints(),
          startAfter(cursor),
          limit(CONNECTION_PAGE_SIZE),
        ),
      );
      const rows = snapshot.docs
        .map((docSnap) => connectionRow(docSnap, uid))
        .filter(Boolean);
      loadedOlderRef.current = true;
      setOlderMatches((current) => mergeConnections(current, rows));
      setCursor(snapshot.docs.at(-1) || cursor);
      setHasMore(snapshot.docs.length === CONNECTION_PAGE_SIZE);
    } catch (loadError) {
      console.error("Failed to load older connections:", loadError);
      setError("Earlier connections did not load. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [baseConstraints, cursor, hasMore, loadingMore, uid]);

  if (loading) {
    return <p className="p-6 text-center text-amber-100">Loading...</p>;
  }

  if (matches.length === 0 && !error) {
    return (
      <div className="min-h-screen bg-[#07120e] p-6 pb-28 text-amber-100">
        <div className="mx-auto mt-12 max-w-xl rounded-[28px] border border-white/10 bg-white/6 p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/70">
            Connections
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-amber-50">
            No mutual Sparks yet.
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Shared moments make the first hello easier. A connection appears only
            after both people privately choose to continue.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/app/explore")}
              className="rounded-2xl bg-amber-300 px-5 py-3 text-sm font-semibold text-[#10201a] transition hover:bg-amber-200"
            >
              Enter Afterlight
            </button>
            <button
              type="button"
              onClick={() => navigate("/app/match-queue")}
              className="rounded-2xl border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-white/12"
            >
              Review introductions
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07120e] p-4 pb-28 text-amber-100">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-2 text-sm text-amber-200/80 transition hover:text-amber-100"
      >
        <ArrowLeft size={18} /> Back
      </button>

      <h2 className="candle-glow mb-4 text-center text-xl font-bold text-amber-50">
        All connections
      </h2>

      {error && (
        <div
          role="alert"
          className="mx-auto mb-5 max-w-xl rounded-2xl border border-amber-200/20 bg-amber-100/10 px-4 py-3 text-center text-sm text-amber-100"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {matches.map((match, index) => (
          <motion.button
            type="button"
            key={match.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 12) * 0.03 }}
            onClick={() => navigate(`/app/match/${buildCombinedIds(match.uid, uid)}`)}
            className="cursor-pointer overflow-hidden rounded-[24px] border border-white/10 bg-white/7 text-left shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
          >
            <img
              src={match.media?.[0]}
              alt={match.displayName}
              className="aspect-[2/3] w-full border-b border-white/10 object-cover"
            />
            <div className="p-2 text-center">
              <p className="truncate font-semibold text-amber-50">
                {match.displayName}
              </p>
              <p className="text-xs text-amber-200/75">{match.age}</p>
              <p className="line-clamp-2 text-[0.65rem] text-white/60">
                {match.bio || "No bio yet."}
              </p>
            </div>
          </motion.button>
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingMore}
            className="rounded-2xl border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-white/12 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore ? "Loading earlier connections..." : "Load earlier connections"}
          </button>
        </div>
      )}
    </div>
  );
}
