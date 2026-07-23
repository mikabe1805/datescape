import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  FaChessBishop,
  FaChessKing,
  FaChessKnight,
  FaChessPawn,
  FaChessQueen,
  FaChessRook,
} from "react-icons/fa6";

const PIECE_ICONS = {
  p: FaChessPawn,
  r: FaChessRook,
  n: FaChessKnight,
  b: FaChessBishop,
  q: FaChessQueen,
  k: FaChessKing,
};
const PIECE_NAMES = {
  p: "pawn",
  r: "rook",
  n: "knight",
  b: "bishop",
  q: "queen",
  k: "king",
};
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

function pickAiMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    let score = 0;
    if (m.captured) score += PIECE_VALUES[m.captured] * 4;
    if (m.flags.includes("p")) score += 6;
    if (m.san.includes("#")) score += 100;
    else if (m.san.includes("+")) score += 1.5;
    score += Math.random() * 1.4;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

// Multiplayer-aware chess game.
// If `multiplayer` is provided ({ myUid, whiteUid, blackUid, moves[], submitMove(action) }),
// runs as a synced two-player game over RTDB.
// Otherwise falls back to local AI.
export default function ChessGame({
  npcName = "Mira",
  multiplayer = null,
  onClose,
  onResult,
}) {
  const [chess, setChess] = useState(() => new Chess());
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState(null);
  const [hints, setHints] = useState([]);
  const [status, setStatus] = useState("");
  const [resolved, setResolved] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const aiTimeoutRef = useRef(null);

  const isMultiplayer = Boolean(multiplayer);
  const myColor = isMultiplayer && multiplayer.myUid === multiplayer.whiteUid ? "w" : isMultiplayer ? "b" : "w";
  const opponentName = isMultiplayer
    ? myColor === "w"
      ? multiplayer.blackName
      : multiplayer.whiteName
    : npcName;
  const multiplayerMoves = multiplayer?.moves;
  const multiplayerMatchId = multiplayer?.matchId;

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const board = useMemo(() => {
    void tick;
    return chess.board();
  }, [chess, tick]);

  const isMyTurn =
    !resolved &&
    !submitting &&
    !syncError &&
    (isMultiplayer ? chess.turn() === myColor : chess.turn() === "w");
  // For multiplayer, view from your color so the board feels personal.
  const flipped = myColor === "b";

  const checkResolution = useCallback(
    (position) => {
      if (position.isCheckmate()) {
        const winner = position.turn() === "w" ? "black" : "white";
        const myWin = isMultiplayer
          ? (winner === "white" && myColor === "w") ||
            (winner === "black" && myColor === "b")
          : winner === "white";
        const text = myWin
          ? `Checkmate. You beat ${opponentName}.`
          : `Checkmate. ${opponentName} got you that time.`;
        setResolved(myWin ? "win" : "loss");
        setStatus(text);
        onResult?.(myWin ? "win" : "loss");
        return true;
      }
      if (
        position.isDraw() ||
        position.isStalemate() ||
        position.isThreefoldRepetition()
      ) {
        setResolved("draw");
        setStatus("Draw. Honorable.");
        onResult?.("draw");
        return true;
      }
      return false;
    },
    [isMultiplayer, myColor, opponentName, onResult],
  );

  // --- Local AI mode ---
  const runAi = useCallback(() => {
    aiTimeoutRef.current = setTimeout(() => {
      if (chess.turn() !== "b" || resolved) return;
      const move = pickAiMove(chess);
      if (!move) {
        checkResolution(chess);
        return;
      }
      chess.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      refresh();
      if (!checkResolution(chess)) {
        setStatus(chess.inCheck() ? "Check. Get out of it." : "Your move.");
      }
    }, 450 + Math.random() * 400);
  }, [chess, refresh, resolved, checkResolution]);

  useEffect(() => {
    if (!isMultiplayer) {
      setStatus(`You're white. Your move against ${opponentName}.`);
    } else {
      setSelected(null);
      setHints([]);
      setResolved(null);
      setSubmitting(false);
      setSyncError(false);
      setStatus(
        myColor === "w"
          ? `Match started — you're white, ${opponentName} is black.`
          : `Match started — you're black, ${opponentName} is white. Wait for their move.`
      );
    }
  }, [isMultiplayer, multiplayerMatchId, myColor, opponentName]);

  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, []);

  // --- Multiplayer: rebuild only from the contiguous server move log. ---
  useEffect(() => {
    if (!isMultiplayer) return;
    const incoming = Array.isArray(multiplayerMoves) ? multiplayerMoves : [];
    const rebuilt = new Chess();
    let valid = Array.isArray(multiplayerMoves);
    incoming.forEach((next, index) => {
      if (!valid || next?.ply !== index + 1 || typeof next.san !== "string") {
        valid = false;
        return;
      }
      try {
        const applied = rebuilt.move(next.san);
        if (!applied || applied.san !== next.san) valid = false;
      } catch {
        valid = false;
      }
    });
    if (!valid) {
      setSubmitting(false);
      setSyncError(true);
      setSelected(null);
      setHints([]);
      setStatus("Board sync is unavailable. Stand up and rejoin this match.");
      return;
    }

    setChess(rebuilt);
    setSubmitting(false);
    setSyncError(false);
    setSelected(null);
    setHints([]);
    if (!checkResolution(rebuilt)) {
      setResolved(null);
      setStatus(
        rebuilt.turn() === myColor
          ? "Your move."
          : `Waiting for ${opponentName}…`,
      );
    }
  }, [
    checkResolution,
    isMultiplayer,
    multiplayerMatchId,
    multiplayerMoves,
    myColor,
    opponentName,
  ]);

  const handleSquareClick = async (sq) => {
    if (!isMyTurn) return;
    const piece = chess.get(sq);
    const myColorChar = isMultiplayer ? myColor : "w";

    if (selected) {
      if (sq === selected) {
        setSelected(null);
        setHints([]);
        return;
      }
      const moves = chess.moves({ square: selected, verbose: true });
      const move = moves.find((m) => m.to === sq);
      if (move) {
        const from = selected;
        setSelected(null);
        setHints([]);
        if (isMultiplayer) {
          setSubmitting(true);
          setStatus("Sending your move…");
          try {
            const response = await multiplayer.submitMove({
              from,
              to: sq,
              promotion: move.promotion || "q",
            });
            if (!response?.ok) {
              setSubmitting(false);
              setStatus(response?.error || "That move could not be submitted.");
            } else {
              // Keep the old board locked until the RTDB listener delivers the
              // committed, server-stamped ply.
              setStatus("Move accepted. Syncing the board…");
            }
          } catch (error) {
            setSubmitting(false);
            setStatus(error?.message || "That move could not be submitted.");
          }
          return;
        }

        chess.move({ from, to: sq, promotion: move.promotion || "q" });
        refresh();
        if (!checkResolution(chess)) {
          setStatus(`${opponentName} is thinking…`);
          runAi();
        }
        return;
      }
      if (piece && piece.color === myColorChar) {
        setSelected(sq);
        setHints(chess.moves({ square: sq, verbose: true }).map((m) => m.to));
        return;
      }
      setSelected(null);
      setHints([]);
      return;
    }

    if (piece && piece.color === myColorChar) {
      setSelected(sq);
      setHints(chess.moves({ square: sq, verbose: true }).map((m) => m.to));
    }
  };

  const handleReset = () => {
    if (isMultiplayer) return; // can't reset a synced game
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    chess.reset();
    setSelected(null);
    setHints([]);
    setResolved(null);
    setStatus(`Fresh board. Your move against ${opponentName}.`);
    refresh();
  };

  const ranks = flipped ? ["1", "2", "3", "4", "5", "6", "7", "8"] : ["8", "7", "6", "5", "4", "3", "2", "1"];
  const files = flipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const displayBoard = flipped ? [...board].reverse().map((r) => [...r].reverse()) : board;

  return (
    <div className="chess-game">
      <div className="chess-game__header">
        <div>
          <div className="chess-game__title">
            {isMultiplayer ? `vs ${opponentName}` : `Chess vs ${npcName}`}
          </div>
          <div className="chess-game__status">{status}</div>
        </div>
        <div className="chess-game__actions">
          {!isMultiplayer && (
            <button type="button" className="chess-game__btn" onClick={handleReset}>
              Reset
            </button>
          )}
          <button type="button" className="chess-game__btn chess-game__btn--primary" onClick={onClose}>
            {isMultiplayer ? "Stand up" : "Done"}
          </button>
        </div>
      </div>
      <div className="chess-game__board" role="grid">
        {displayBoard.map((row, ri) =>
          row.map((square, fi) => {
            const sq = files[fi] + ranks[ri];
            const isLight = (ri + fi) % 2 === 0;
            const isSelected = selected === sq;
            const isHint = hints.includes(sq);
            const PieceIcon = square ? PIECE_ICONS[square.type] : null;
            const squareLabel = square
              ? `${sq}, ${square.color === "w" ? "white" : "black"} ${PIECE_NAMES[square.type]}`
              : `${sq}, empty`;
            return (
              <button
                key={sq}
                type="button"
                className={[
                  "chess-game__square",
                  isLight ? "is-light" : "is-dark",
                  isSelected ? "is-selected" : "",
                  isHint ? "is-hint" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => void handleSquareClick(sq)}
                aria-label={squareLabel}
              >
                {PieceIcon && (
                  <span className={`chess-game__piece is-${square.color === "w" ? "white" : "black"}`}>
                    <PieceIcon aria-hidden="true" focusable="false" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
