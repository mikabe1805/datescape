import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

const PIECE_GLYPHS = {
  wp: "♙", wr: "♖", wn: "♘", wb: "♗", wq: "♕", wk: "♔",
  bp: "♟", br: "♜", bn: "♞", bb: "♝", bq: "♛", bk: "♚",
};
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

function pieceKey(piece) {
  return `${piece.color}${piece.type}`;
}

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
// If `multiplayer` is provided ({ myUid, whiteUid, blackUid, moves[], submitMove(san, fen) }),
// runs as a synced two-player game over RTDB.
// Otherwise falls back to local AI.
export default function ChessGame({
  npcName = "Mira",
  multiplayer = null,
  onClose,
  onResult,
}) {
  const [chess] = useState(() => new Chess());
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState(null);
  const [hints, setHints] = useState([]);
  const [status, setStatus] = useState("");
  const [resolved, setResolved] = useState(null);
  const aiTimeoutRef = useRef(null);
  const appliedMovesCountRef = useRef(0);

  const isMultiplayer = Boolean(multiplayer);
  const myColor = isMultiplayer && multiplayer.myUid === multiplayer.whiteUid ? "w" : isMultiplayer ? "b" : "w";
  const opponentName = isMultiplayer
    ? myColor === "w"
      ? multiplayer.blackName
      : multiplayer.whiteName
    : npcName;

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const board = useMemo(() => {
    void tick;
    return chess.board();
  }, [chess, tick]);

  const isMyTurn = !resolved && (isMultiplayer ? chess.turn() === myColor : chess.turn() === "w");
  // For multiplayer, view from your color so the board feels personal.
  const flipped = myColor === "b";

  const checkResolution = useCallback(() => {
    if (chess.isCheckmate()) {
      const winner = chess.turn() === "w" ? "black" : "white";
      const myWin = isMultiplayer
        ? (winner === "white" && myColor === "w") || (winner === "black" && myColor === "b")
        : winner === "white";
      const text = myWin
        ? `Checkmate. You beat ${opponentName}.`
        : `Checkmate. ${opponentName} got you that time.`;
      setResolved(myWin ? "win" : "loss");
      setStatus(text);
      onResult?.(myWin ? "win" : "loss");
      return true;
    }
    if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
      setResolved("draw");
      setStatus("Draw. Honorable.");
      onResult?.("draw");
      return true;
    }
    return false;
  }, [chess, isMultiplayer, myColor, opponentName, onResult]);

  // --- Local AI mode ---
  const runAi = useCallback(() => {
    aiTimeoutRef.current = setTimeout(() => {
      if (chess.turn() !== "b" || resolved) return;
      const move = pickAiMove(chess);
      if (!move) {
        checkResolution();
        return;
      }
      chess.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
      refresh();
      if (!checkResolution()) {
        setStatus(chess.inCheck() ? "Check. Get out of it." : "Your move.");
      }
    }, 450 + Math.random() * 400);
  }, [chess, refresh, resolved, checkResolution]);

  useEffect(() => {
    if (!isMultiplayer) {
      setStatus(`You're white. Your move against ${opponentName}.`);
    } else {
      setStatus(
        myColor === "w"
          ? `Match started — you're white, ${opponentName} is black.`
          : `Match started — you're black, ${opponentName} is white. Wait for their move.`
      );
    }
  }, [isMultiplayer, myColor, opponentName]);

  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, []);

  // --- Multiplayer: apply incoming moves ---
  useEffect(() => {
    if (!isMultiplayer) return;
    const incoming = multiplayer.moves || [];
    while (appliedMovesCountRef.current < incoming.length) {
      const next = incoming[appliedMovesCountRef.current];
      if (!next?.san) {
        appliedMovesCountRef.current += 1;
        continue;
      }
      try {
        chess.move(next.san);
      } catch {
        // ignore invalid sync moves
      }
      appliedMovesCountRef.current += 1;
    }
    refresh();
    if (!checkResolution()) {
      setStatus(chess.turn() === myColor ? "Your move." : `Waiting for ${opponentName}…`);
    }
  }, [isMultiplayer, multiplayer?.moves, chess, refresh, checkResolution, myColor, opponentName]);

  const handleSquareClick = (sq) => {
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
        const result = chess.move({ from: selected, to: sq, promotion: "q" });
        const san = result?.san;
        const fen = chess.fen();
        setSelected(null);
        setHints([]);
        refresh();
        if (isMultiplayer && san) {
          appliedMovesCountRef.current += 1; // we wrote this one
          multiplayer.submitMove(san, fen);
        }
        if (!checkResolution()) {
          if (isMultiplayer) {
            setStatus(`Waiting for ${opponentName}…`);
          } else {
            setStatus(`${opponentName} is thinking…`);
            runAi();
          }
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
            const piece = square ? PIECE_GLYPHS[pieceKey(square)] : null;
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
                onClick={() => handleSquareClick(sq)}
                aria-label={sq}
              >
                {piece && (
                  <span className={`chess-game__piece is-${square.color === "w" ? "white" : "black"}`}>
                    {piece}
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
