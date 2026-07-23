import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";

export const RESONANCE_ROUNDS = 3;
export const RESONANCE_BEAT_MS = 1800;

export const RESONANCE_TONES = Object.freeze([
  {
    id: "tide",
    label: "Tide",
    note: "low and clear",
    color: "#75d8d0",
    frequency: 261.63,
  },
  {
    id: "ember",
    label: "Ember",
    note: "warm and bright",
    color: "#f09a72",
    frequency: 329.63,
  },
  {
    id: "bloom",
    label: "Bloom",
    note: "soft and open",
    color: "#c4a7ff",
    frequency: 392,
  },
]);

const TONE_BY_ID = new Map(RESONANCE_TONES.map((tone) => [tone.id, tone]));

const CONVERSATION_HANDOFFS = [
  {
    kicker: "Carry the sound with you",
    prompt: "If this little rhythm belonged to a place, where would it be?",
  },
  {
    kicker: "A note from home",
    prompt: "What sound can make a place feel like home to you?",
  },
  {
    kicker: "Leave room for surprise",
    prompt: "What small, unexpected thing made you smile recently?",
  },
  {
    kicker: "The part between notes",
    prompt: "What kind of quiet do you enjoy sharing with someone?",
  },
  {
    kicker: "An evening in three tones",
    prompt: "What makes an ordinary evening feel memorable to you?",
  },
  {
    kicker: "Lead, answer, wander",
    prompt: "When a plan is open-ended, what do you naturally bring to it?",
  },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function timestampToMillis(value) {
  if (Number.isFinite(value)) return Number(value);
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") {
    const milliseconds = value.toMillis();
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (Number.isFinite(value?.seconds)) {
    return value.seconds * 1000 + (Number(value.nanoseconds) || 0) / 1e6;
  }
  return null;
}

export function normalizeResonanceNote(value) {
  const source = typeof value === "string" ? { tone: value } : value;
  if (!source || typeof source !== "object" || !TONE_BY_ID.has(source.tone)) {
    return null;
  }

  const accuracy = Number.isFinite(source.accuracy)
    ? clamp(Number(source.accuracy), 0, 1)
    : 0.5;
  const at = timestampToMillis(source.at);
  return {
    tone: source.tone,
    accuracy,
    ...(at === null ? {} : { at }),
  };
}

export function resonanceTiming(
  now,
  startedAt,
  beatMs = RESONANCE_BEAT_MS,
) {
  const safeNow = Number.isFinite(now) ? now : 0;
  const safeStart = timestampToMillis(startedAt) ?? safeNow;
  const safeBeat = Number.isFinite(beatMs) && beatMs > 0 ? beatMs : RESONANCE_BEAT_MS;
  const elapsed = Math.max(0, safeNow - safeStart);
  const phase = (elapsed % safeBeat) / safeBeat;
  const accuracy = clamp(1 - Math.abs(phase - 0.5) * 2, 0, 1);

  return {
    phase,
    accuracy,
    label:
      accuracy >= 0.78
        ? "On the glow"
        : accuracy >= 0.45
          ? "Close echo"
          : "Free echo",
  };
}

function participant(uid, name, color, fallbackName) {
  return uid
    ? {
        uid,
        name: String(name || fallbackName).slice(0, 30),
        color: color || "#8ad6c6",
      }
    : null;
}

export function resonanceParticipants(match, myUid) {
  const white = participant(
    match?.white,
    match?.whiteName,
    match?.whiteColor,
    "Guest one",
  );
  const black = participant(
    match?.black,
    match?.blackName,
    match?.blackColor,
    "Guest two",
  );
  const people = [white, black].filter(Boolean);
  const me = people.find((person) => person.uid === myUid) || null;
  const opponent = people.find((person) => person.uid !== myUid) || null;
  return { me, opponent, people };
}

function noteAt(notes, round, uid) {
  return normalizeResonanceNote(notes?.[round]?.[uid]);
}

export function resonanceProgress(match, myUid, optimisticNotes = {}) {
  const { people, me, opponent } = resonanceParticipants(match, myUid);
  const rounds = Array.from({ length: RESONANCE_ROUNDS }, (_, round) => {
    const notes = {};
    people.forEach(({ uid }) => {
      notes[uid] =
        noteAt(match?.notes, round, uid) || noteAt(optimisticNotes, round, uid);
    });
    return {
      round,
      notes,
      complete:
        people.length === 2 && people.every(({ uid }) => Boolean(notes[uid])),
    };
  });
  const firstOpenRound = rounds.findIndex((round) => !round.complete);
  const complete = people.length === 2 && firstOpenRound === -1;
  const activeRound = complete ? RESONANCE_ROUNDS : Math.max(0, firstOpenRound);
  const current = rounds[activeRound] || null;

  return {
    me,
    opponent,
    people,
    rounds,
    activeRound,
    complete,
    completedRounds: rounds.filter((round) => round.complete).length,
    myNote: me && current ? current.notes[me.uid] : null,
    opponentNote: opponent && current ? current.notes[opponent.uid] : null,
  };
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resonanceConversation(match, myUid, optimisticNotes = {}) {
  const progress = resonanceProgress(match, myUid, optimisticNotes);
  const pattern = progress.rounds
    .flatMap((round) =>
      progress.people.map((person) => round.notes[person.uid]?.tone || "rest"),
    )
    .join("-");
  const seed = `${match?.id || "resonance-duet"}:${pattern}`;
  return CONVERSATION_HANDOFFS[hashText(seed) % CONVERSATION_HANDOFFS.length];
}

function playSynthTone(audioRef, toneId, accuracy = 0.5) {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !TONE_BY_ID.has(toneId)) return;

  try {
    const context = audioRef.current || new AudioContextClass();
    audioRef.current = context;
    const play = () => {
      const tone = TONE_BY_ID.get(toneId);
      const startedAt = context.currentTime + 0.015;
      const oscillator = context.createOscillator();
      const shimmer = context.createOscillator();
      const gain = context.createGain();
      const shimmerGain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, startedAt);
      shimmer.type = "triangle";
      shimmer.frequency.setValueAtTime(tone.frequency * 2, startedAt);
      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.12, startedAt + 0.035);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        startedAt + 0.55 + accuracy * 0.22,
      );
      shimmerGain.gain.setValueAtTime(0.0001, startedAt);
      shimmerGain.gain.exponentialRampToValueAtTime(0.025, startedAt + 0.05);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.38);

      oscillator.connect(gain).connect(context.destination);
      shimmer.connect(shimmerGain).connect(context.destination);
      oscillator.start(startedAt);
      shimmer.start(startedAt);
      oscillator.stop(startedAt + 0.82);
      shimmer.stop(startedAt + 0.5);
    };

    if (context.state === "suspended") {
      Promise.resolve(context.resume()).then(play).catch(() => {});
    } else {
      play();
    }
  } catch {
    // Sound is enhancement only. The visual loop remains fully playable.
  }
}

const styles = {
  root: {
    position: "relative",
    overflow: "hidden",
    width: "min(680px, 100%)",
    margin: "0 auto",
    padding: "clamp(20px, 4vw, 34px)",
    color: "#f6f3ec",
    border: "1px solid rgba(139, 220, 211, 0.24)",
    borderRadius: 28,
    background:
      "radial-gradient(circle at 50% 0%, rgba(84, 176, 170, 0.2), transparent 42%), linear-gradient(145deg, rgba(7, 29, 36, 0.98), rgba(11, 20, 32, 0.98))",
    boxShadow: "0 28px 90px rgba(0, 0, 0, 0.42)",
  },
  wash: {
    position: "absolute",
    inset: "auto -20% -45%",
    height: "65%",
    borderRadius: "50%",
    background: "rgba(119, 96, 190, 0.12)",
    filter: "blur(40px)",
    pointerEvents: "none",
  },
  header: { position: "relative", textAlign: "center" },
  eyebrow: {
    color: "#8bdcd3",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
  },
  title: {
    margin: "9px 0 7px",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "clamp(28px, 6vw, 44px)",
    fontWeight: 500,
    lineHeight: 1.05,
  },
  intro: {
    maxWidth: 470,
    margin: "0 auto",
    color: "rgba(235, 242, 239, 0.7)",
    fontSize: 14,
    lineHeight: 1.55,
  },
  leave: {
    position: "absolute",
    zIndex: 2,
    top: 14,
    right: 14,
    width: 38,
    height: 38,
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "50%",
    color: "rgba(255,255,255,0.72)",
    background: "rgba(0,0,0,0.16)",
    cursor: "pointer",
    fontSize: 19,
    display: "grid",
    placeItems: "center",
  },
  progress: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    margin: "24px 0 18px",
  },
  round: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 0,
    padding: "10px 8px",
    borderRadius: 13,
    border: "1px solid rgba(255,255,255,0.09)",
    textAlign: "center",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  playArea: {
    position: "relative",
    padding: "22px clamp(14px, 3vw, 24px)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 22,
    background: "rgba(4, 15, 22, 0.46)",
  },
  pulse: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    width: 118,
    height: 118,
    margin: "4px auto 17px",
    borderRadius: "50%",
  },
  pulseRing: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: "1px solid rgba(130, 226, 213, 0.55)",
    boxShadow: "0 0 35px rgba(84, 211, 197, 0.18)",
    transition: "transform 80ms linear, opacity 80ms linear",
  },
  pulseCore: {
    display: "grid",
    placeItems: "center",
    width: 65,
    height: 65,
    borderRadius: "50%",
    background:
      "radial-gradient(circle at 40% 34%, #d5fff7, #69cfc5 38%, #204b53 72%)",
    color: "#09252c",
    boxShadow: "0 0 28px rgba(117, 216, 208, 0.36)",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  status: {
    minHeight: 44,
    margin: "0 auto 17px",
    maxWidth: 430,
    color: "rgba(239, 245, 242, 0.82)",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 1.5,
  },
  tones: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 9,
  },
  toneButton: {
    minWidth: 0,
    padding: "13px 7px 12px",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 15,
    color: "#f8f6f0",
    background: "rgba(255,255,255,0.055)",
    cursor: "pointer",
    transition: "transform 150ms ease, border-color 150ms ease",
  },
  toneDot: {
    display: "block",
    width: 13,
    height: 13,
    margin: "0 auto 8px",
    borderRadius: "50%",
  },
  toneLabel: { display: "block", fontSize: 14, fontWeight: 800 },
  toneNote: {
    display: "block",
    overflow: "hidden",
    marginTop: 3,
    color: "rgba(235,242,239,0.58)",
    fontSize: 10,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pair: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 14,
  },
  person: {
    minWidth: 0,
    padding: "11px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.045)",
  },
  personName: {
    display: "block",
    overflow: "hidden",
    color: "rgba(235,242,239,0.62)",
    fontSize: 11,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  personNote: { display: "block", marginTop: 4, fontSize: 13, fontWeight: 750 },
  final: {
    position: "relative",
    padding: "25px clamp(16px, 4vw, 30px)",
    border: "1px solid rgba(196, 167, 255, 0.24)",
    borderRadius: 22,
    background:
      "linear-gradient(145deg, rgba(91, 65, 128, 0.22), rgba(28, 84, 83, 0.18))",
    textAlign: "center",
  },
  pattern: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 7,
    margin: "15px 0 20px",
  },
  patternTone: {
    width: 30,
    height: 30,
    border: "2px solid rgba(255,255,255,0.5)",
    borderRadius: "50%",
    boxShadow: "0 0 18px rgba(255,255,255,0.1)",
  },
  prompt: {
    maxWidth: 470,
    margin: "0 auto 17px",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: "clamp(20px, 4vw, 27px)",
    lineHeight: 1.32,
  },
  consent: {
    maxWidth: 480,
    margin: "0 auto 19px",
    color: "rgba(235,242,239,0.62)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 9,
  },
  primary: {
    padding: "12px 18px",
    border: 0,
    borderRadius: 999,
    color: "#092126",
    background: "#9ae1d8",
    cursor: "pointer",
    fontWeight: 850,
  },
  secondary: {
    padding: "12px 18px",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 999,
    color: "rgba(255,255,255,0.78)",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 700,
  },
};

function noteLabel(note) {
  if (!note) return "Listening…";
  const tone = TONE_BY_ID.get(note.tone);
  return `${tone?.label || "Tone"} · ${resonanceTiming(note.accuracy, 0, 2).label}`;
}

export default function ResonanceDuet({
  match,
  myUid,
  soundEnabled = true,
  onPulse,
  onResolved,
  onComplete,
  onLeave,
}) {
  const [optimisticNotes, setOptimisticNotes] = useState({});
  const [pendingLocalRounds, setPendingLocalRounds] = useState(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const audioRef = useRef(null);
  const heardRemoteNotesRef = useRef(new Set());
  const resolvedMatchIdsRef = useRef(new Set());
  const matchId = match?.id || null;
  const currentMatchIdRef = useRef(matchId);
  currentMatchIdRef.current = matchId;

  useEffect(() => {
    setOptimisticNotes({});
    setPendingLocalRounds(new Set());
    heardRemoteNotesRef.current = new Set();
  }, [matchId]);

  const progress = useMemo(
    () => resonanceProgress(match, myUid, optimisticNotes),
    [match, myUid, optimisticNotes],
  );
  const authoritativeProgress = useMemo(
    () => resonanceProgress(match, myUid),
    [match, myUid],
  );
  const conversation = useMemo(
    () => resonanceConversation(match, myUid),
    [match, myUid],
  );
  const startedAt =
    timestampToMillis(match?.roundStartedAt?.[progress.activeRound]) ??
    timestampToMillis(match?.startedAt) ??
    now;
  const timing = resonanceTiming(now, startedAt);
  const pendingMatchPrefix = `${matchId}:`;
  const hasPendingLocalNote = [...pendingLocalRounds].some((key) =>
    key.startsWith(pendingMatchPrefix),
  );

  useEffect(() => {
    if (
      typeof onResolved !== "function" ||
      !matchId ||
      !authoritativeProgress.complete ||
      hasPendingLocalNote ||
      resolvedMatchIdsRef.current.has(matchId)
    ) {
      return;
    }
    resolvedMatchIdsRef.current.add(matchId);
    onResolved({
      matchId,
      opponent: authoritativeProgress.opponent,
      kicker: conversation.kicker,
      prompt: conversation.prompt,
    });
  }, [
    authoritativeProgress.complete,
    authoritativeProgress.opponent,
    conversation.kicker,
    conversation.prompt,
    hasPendingLocalNote,
    matchId,
    onResolved,
  ]);

  useEffect(() => {
    if (progress.complete) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(timer);
  }, [progress.complete]);

  const remoteNoteSignature = useMemo(
    () =>
      progress.opponent
        ? progress.rounds
            .map((round) => {
              const note = round.notes[progress.opponent.uid];
              return note ? `${round.round}:${note.tone}:${note.at || 0}` : "";
            })
            .join("|")
        : "",
    [progress.opponent, progress.rounds],
  );

  useEffect(() => {
    if (!progress.opponent) return;
    progress.rounds.forEach((round) => {
      const note = round.notes[progress.opponent.uid];
      if (!note) return;
      const key = `${round.round}:${progress.opponent.uid}:${note.tone}:${note.at || 0}`;
      if (heardRemoteNotesRef.current.has(key)) return;
      heardRemoteNotesRef.current.add(key);
      if (soundEnabled && audioRef.current) {
        playSynthTone(audioRef, note.tone, note.accuracy);
      }
    });
  }, [progress.opponent, progress.rounds, remoteNoteSignature, soundEnabled]);

  useEffect(() => {
    if (soundEnabled) return;
    const context = audioRef.current;
    audioRef.current = null;
    if (context && typeof context.close === "function") {
      Promise.resolve(context.close()).catch(() => {});
    }
  }, [soundEnabled]);

  useEffect(
    () => () => {
      const context = audioRef.current;
      if (context && typeof context.close === "function") {
        Promise.resolve(context.close()).catch(() => {});
      }
    },
    [],
  );

  const submitTone = (toneId) => {
    if (
      progress.complete ||
      hasPendingLocalNote ||
      !progress.me ||
      progress.myNote ||
      !TONE_BY_ID.has(toneId)
    )
      return;
    const pulseTiming = resonanceTiming(Date.now(), startedAt);
    const accuracy = Math.round(pulseTiming.accuracy * 1000) / 1000;
    const note = { tone: toneId, accuracy, at: Date.now() };
    const submittedMatchId = matchId;
    const pendingKey = `${submittedMatchId}:${progress.activeRound}`;
    setOptimisticNotes((current) => ({
      ...current,
      [progress.activeRound]: {
        ...(current[progress.activeRound] || {}),
        [progress.me.uid]: note,
      },
    }));
    setPendingLocalRounds((current) => {
      const next = new Set(current);
      next.add(pendingKey);
      return next;
    });
    if (soundEnabled) playSynthTone(audioRef, toneId, accuracy);
    const submittedRound = progress.activeRound;
    const submittedUid = progress.me.uid;
    Promise.resolve(onPulse?.(submittedRound, toneId, accuracy))
      .then((result) => {
        if (currentMatchIdRef.current !== submittedMatchId) return;
        setPendingLocalRounds((current) => {
          const next = new Set(current);
          next.delete(pendingKey);
          return next;
        });
        if (result?.ok !== false) return;
        setOptimisticNotes((current) => {
          const roundNotes = { ...(current[submittedRound] || {}) };
          delete roundNotes[submittedUid];
          if (Object.keys(roundNotes).length) {
            return { ...current, [submittedRound]: roundNotes };
          }
          const next = { ...current };
          delete next[submittedRound];
          return next;
        });
      })
      .catch(() => {
        if (currentMatchIdRef.current !== submittedMatchId) return;
        setPendingLocalRounds((current) => {
          const next = new Set(current);
          next.delete(pendingKey);
          return next;
        });
        setOptimisticNotes((current) => {
          const next = { ...current };
          delete next[submittedRound];
          return next;
        });
      });
  };

  if (!progress.me || !progress.opponent) {
    return (
      <section style={styles.root} aria-labelledby="resonance-duet-title">
        <div style={styles.header}>
          <div style={styles.eyebrow}>Resonance Garden · duet loom</div>
          <h2 id="resonance-duet-title" style={styles.title}>
            Waiting for both players
          </h2>
          <p style={styles.intro}>
            This shared moment opens when the match contains you and one other
            participant.
          </p>
        </div>
        <div style={{ ...styles.actions, marginTop: 22 }}>
          <button type="button" style={styles.secondary} onClick={onLeave}>
            Return to the garden
          </button>
        </div>
      </section>
    );
  }

  const status = progress.myNote
    ? progress.opponentNote
      ? "Your tones found each other."
      : `Your tone is traveling to ${progress.opponent.name}.`
    : progress.opponentNote
      ? `${progress.opponent.name} left a tone. Add yours whenever it feels right.`
      : "Choose a tone when the inner glow feels fullest. There is no wrong beat.";

  return (
    <section
      className="resonance-duet"
      style={styles.root}
      aria-labelledby="resonance-duet-title"
    >
      <div style={styles.wash} aria-hidden="true" />
      <button
        type="button"
        style={styles.leave}
        onClick={onLeave}
        aria-label="Leave the Resonance Duet"
      >
        <X size={20} aria-hidden="true" />
      </button>

      <header style={styles.header}>
        <div style={styles.eyebrow}>Resonance Garden · duet loom</div>
        <h2 id="resonance-duet-title" style={styles.title}>
          Make room for an answer
        </h2>
        <p style={styles.intro}>
          Three tones each. Listen, answer, or wander off the beat—the Garden
          keeps every contribution.
        </p>
      </header>

      <div style={styles.progress} aria-label="Three duet rounds">
        {progress.rounds.map((round) => {
          const isActive = !progress.complete && round.round === progress.activeRound;
          return (
            <div
              key={round.round}
              style={{
                ...styles.round,
                color: round.complete
                  ? "#b8eee5"
                  : isActive
                    ? "#fff7eb"
                    : "rgba(235,242,239,0.38)",
                borderColor: round.complete
                  ? "rgba(139,220,211,0.3)"
                  : isActive
                    ? "rgba(240,154,114,0.36)"
                    : "rgba(255,255,255,0.08)",
                background: round.complete
                  ? "rgba(74,157,148,0.12)"
                  : isActive
                    ? "rgba(240,154,114,0.08)"
                    : "rgba(255,255,255,0.025)",
              }}
            >
              {round.complete ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
              <span>Round {round.round + 1}</span>
            </div>
          );
        })}
      </div>

      {authoritativeProgress.complete && !hasPendingLocalNote ? (
        <div style={styles.final} data-testid="resonance-duet-complete">
          <div style={styles.eyebrow}>{conversation.kicker}</div>
          <div style={styles.pattern} aria-label="Your completed tone pattern">
            {authoritativeProgress.rounds.flatMap((round) =>
              authoritativeProgress.people.map((person) => {
                const note = round.notes[person.uid];
                const tone = TONE_BY_ID.get(note.tone);
                return (
                  <span
                    key={`${round.round}-${person.uid}`}
                    title={`${person.name}: ${tone.label}`}
                    style={{
                      ...styles.patternTone,
                      background: tone.color,
                    }}
                  />
                );
              }),
            )}
          </div>
          <p style={styles.prompt}>{conversation.prompt}</p>
          <p style={styles.consent}>
            Keep talking if the moment feels easy. A private Spark can come
            later, and neither person is asked to decide anything here.
          </p>
          {onResolved ? (
            <p style={styles.consent} role="status" aria-live="polite">
              Saving a private copy for each player…
            </p>
          ) : (
            <div style={styles.actions}>
              <button
                type="button"
                style={styles.primary}
                onClick={() => onComplete?.(authoritativeProgress.opponent)}
              >
                Continue with {authoritativeProgress.opponent.name}
              </button>
              <button type="button" style={styles.secondary} onClick={onLeave}>
                Leave kindly
              </button>
            </div>
          )}
        </div>
      ) : progress.complete ? (
        <div style={styles.final} data-testid="resonance-duet-syncing">
          <div style={styles.eyebrow}>The shared pattern is almost here</div>
          <p style={{ ...styles.prompt, marginTop: 14 }}>
            Letting the final tone land for both players...
          </p>
          <p style={styles.consent} aria-live="polite">
            Stay for a breath while the Garden carries the last note across.
            Your next step will open as soon as both sides have received it.
          </p>
        </div>
      ) : (
        <div style={styles.playArea} data-testid="resonance-duet-round">
          <div style={styles.eyebrow}>
            Round {progress.activeRound + 1} of {RESONANCE_ROUNDS}
          </div>
          <div style={styles.pulse} aria-hidden="true">
            <span
              style={{
                ...styles.pulseRing,
                transform: `scale(${0.72 + timing.accuracy * 0.28})`,
                opacity: 0.34 + timing.accuracy * 0.66,
              }}
            />
            <span style={styles.pulseCore}>{timing.label}</span>
          </div>
          <p style={styles.status} aria-live="polite">
            {status}
          </p>

          <div style={styles.tones} aria-label="Choose your tone">
            {RESONANCE_TONES.map((tone) => {
              const selected = progress.myNote?.tone === tone.id;
              return (
                <button
                  key={tone.id}
                  type="button"
                  style={{
                    ...styles.toneButton,
                    opacity: progress.myNote && !selected ? 0.42 : 1,
                    borderColor: selected ? tone.color : "rgba(255,255,255,0.13)",
                    boxShadow: selected ? `0 0 22px ${tone.color}22` : "none",
                    cursor: progress.myNote ? "default" : "pointer",
                  }}
                  disabled={Boolean(progress.myNote)}
                  onClick={() => submitTone(tone.id)}
                  aria-label={`Play ${tone.label}`}
                >
                  <span
                    style={{
                      ...styles.toneDot,
                      background: tone.color,
                      boxShadow: `0 0 14px ${tone.color}`,
                    }}
                  />
                  <span style={styles.toneLabel}>{tone.label}</span>
                  <span style={styles.toneNote}>{tone.note}</span>
                </button>
              );
            })}
          </div>

          <div style={styles.pair} aria-label="Notes in this round">
            <div style={styles.person}>
              <span style={styles.personName}>You</span>
              <span style={styles.personNote}>{noteLabel(progress.myNote)}</span>
            </div>
            <div style={styles.person}>
              <span style={styles.personName}>{progress.opponent.name}</span>
              <span style={styles.personNote}>
                {noteLabel(progress.opponentNote)}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
