const { Chess } = require("chess.js");

const STATION_CHESS_ROOM_ID = "afterlight-market-garden-v1";
const STATION_CHESS_INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const STATION_CHESS_MAX_MOVES = 512;
const STATION_CHESS_MOVE_KEY = /^m(\d{3})$/;
const STATION_CHESS_SESSION_ID = /^[a-f0-9]{32}$/;
const STATION_CHESS_ACTION_ID = /^[A-Za-z0-9:_-]{16,160}$/;
const STATION_CHESS_STATION_ID = /^[A-Za-z0-9_-]{1,160}$/;
const STATION_CHESS_MATCH_ID = /^[A-Za-z0-9:_-]{1,160}$/;
const STATION_CHESS_SQUARE = /^[a-h][1-8]$/;
const SAFE_REALTIME_UID = /^[^.#$\[\]\/]{1,128}$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeRealtimeUid(value) {
  if (typeof value !== "string" || value.trim() !== value) return null;
  return SAFE_REALTIME_UID.test(value) ? value : null;
}

function normalizeStationChessMoveRequest(value) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "room",
      "stationId",
      "matchId",
      "seatSessionId",
      "actionId",
      "from",
      "to",
      "promotion",
    ]) ||
    value.room !== STATION_CHESS_ROOM_ID ||
    typeof value.stationId !== "string" ||
    !STATION_CHESS_STATION_ID.test(value.stationId) ||
    typeof value.matchId !== "string" ||
    !STATION_CHESS_MATCH_ID.test(value.matchId) ||
    typeof value.seatSessionId !== "string" ||
    !STATION_CHESS_SESSION_ID.test(value.seatSessionId) ||
    typeof value.actionId !== "string" ||
    !STATION_CHESS_ACTION_ID.test(value.actionId) ||
    typeof value.from !== "string" ||
    !STATION_CHESS_SQUARE.test(value.from) ||
    typeof value.to !== "string" ||
    !STATION_CHESS_SQUARE.test(value.to) ||
    value.from === value.to ||
    (value.promotion !== undefined &&
      !["q", "r", "b", "n"].includes(value.promotion))
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    action: {
      room: value.room,
      stationId: value.stationId,
      matchId: value.matchId,
      seatSessionId: value.seatSessionId,
      actionId: value.actionId,
      from: value.from,
      to: value.to,
      promotion: value.promotion || "q",
    },
  };
}

function stationChessPairForRequest(station, uid, matchId) {
  const match = isRecord(station?.match) ? station.match : null;
  const whiteUid = safeRealtimeUid(match?.white);
  const blackUid = safeRealtimeUid(match?.black);
  if (
    !match ||
    (match.mode !== undefined && match.mode !== "chess") ||
    match.id !== matchId ||
    !whiteUid ||
    !blackUid ||
    whiteUid === blackUid ||
    (uid !== whiteUid && uid !== blackUid)
  ) {
    return null;
  }
  return { whiteUid, blackUid };
}

function normalizedChessHistory(match) {
  if (
    typeof match?.fen !== "string" ||
    !match.fen ||
    match.fen.length > 120
  ) {
    return null;
  }
  const moves = match.moves === undefined ? {} : match.moves;
  if (!isRecord(moves)) return null;
  const entries = Object.entries(moves)
    .map(([key, value]) => {
      const keyMatch = STATION_CHESS_MOVE_KEY.exec(key);
      return keyMatch ? { key, ply: Number(keyMatch[1]), value } : null;
    })
    .filter(Boolean)
    .sort((first, second) => first.ply - second.ply);
  if (
    entries.length > STATION_CHESS_MAX_MOVES ||
    entries.length !== Object.keys(moves).length ||
    entries.some((entry, index) => entry.ply !== index + 1)
  ) {
    return null;
  }

  const chess = new Chess(STATION_CHESS_INITIAL_FEN);
  const normalizedMoves = {};
  for (const entry of entries) {
    const move = entry.value;
    const expectedUid = chess.turn() === "w" ? match.white : match.black;
    const allowedKeys = ["san", "by", "at", "ply", "actionId"];
    if (
      !isRecord(move) ||
      !hasOnlyKeys(move, allowedKeys) ||
      typeof move.san !== "string" ||
      !move.san ||
      move.san.length > 24 ||
      move.by !== expectedUid ||
      !Number.isFinite(move.at) ||
      (move.ply !== undefined && move.ply !== entry.ply) ||
      (move.actionId !== undefined &&
        (typeof move.actionId !== "string" ||
          !STATION_CHESS_ACTION_ID.test(move.actionId)))
    ) {
      return null;
    }
    let applied;
    try {
      applied = chess.move(move.san);
    } catch {
      return null;
    }
    if (!applied || applied.san !== move.san) return null;
    normalizedMoves[entry.key] = {
      san: move.san,
      by: move.by,
      at: move.at,
      ply: entry.ply,
      ...(move.actionId ? { actionId: move.actionId } : {}),
    };
  }
  if (chess.fen() !== match.fen) return null;
  return { chess, entries, normalizedMoves };
}

function stationChessResult(chess, ply) {
  if (chess.isCheckmate()) return chess.turn() === "w" ? "black" : "white";
  if (chess.isDraw() || ply >= STATION_CHESS_MAX_MOVES) return "draw";
  return null;
}

function applyStationChessMove(station, action, now, { blocked = null } = {}) {
  if (
    !isRecord(station) ||
    !isRecord(action) ||
    !Number.isSafeInteger(now) ||
    now <= 0 ||
    blocked !== false
  ) {
    return { ok: false, code: "station-unavailable", station };
  }
  const uid = safeRealtimeUid(action.uid);
  const pair = stationChessPairForRequest(station, uid, action.matchId);
  const match = station.match;
  if (!uid || !pair) {
    return { ok: false, code: "station-unavailable", station };
  }
  const whiteSession = match.whiteSeatSessionId;
  const blackSession = match.blackSeatSessionId;
  const callerSession = uid === pair.whiteUid ? whiteSession : blackSession;
  if (
    !STATION_CHESS_SESSION_ID.test(whiteSession) ||
    !STATION_CHESS_SESSION_ID.test(blackSession) ||
    action.seatSessionId !== callerSession ||
    station.seats?.[pair.whiteUid]?.sessionId !== whiteSession ||
    station.seats?.[pair.blackUid]?.sessionId !== blackSession
  ) {
    return { ok: false, code: "station-unavailable", station };
  }

  const history = normalizedChessHistory(match);
  if (!history) {
    return { ok: false, code: "invalid-chess-state", station };
  }
  const duplicate = history.entries.find(
    (entry) => entry.value.actionId === action.actionId,
  );
  if (duplicate) {
    if (duplicate.value.by !== uid) {
      return { ok: false, code: "action-conflict", station };
    }
    return {
      ok: true,
      applied: false,
      duplicate: true,
      station,
      move: {
        ply: duplicate.ply,
        san: duplicate.value.san,
        by: duplicate.value.by,
        at: duplicate.value.at,
      },
      fen: match.fen,
      result: match.result || null,
    };
  }
  if (match.result || match.endedAt || history.chess.isGameOver()) {
    return { ok: false, code: "game-ended", station };
  }
  if (history.entries.length >= STATION_CHESS_MAX_MOVES) {
    return { ok: false, code: "move-limit", station };
  }
  const expectedUid = history.chess.turn() === "w" ? pair.whiteUid : pair.blackUid;
  if (expectedUid !== uid) {
    return { ok: false, code: "wrong-turn", station };
  }

  let applied;
  try {
    applied = history.chess.move({
      from: action.from,
      to: action.to,
      promotion: action.promotion,
    });
  } catch {
    return { ok: false, code: "illegal-move", station };
  }
  if (!applied) return { ok: false, code: "illegal-move", station };

  const ply = history.entries.length + 1;
  const moveKey = `m${String(ply).padStart(3, "0")}`;
  const move = {
    actionId: action.actionId,
    san: applied.san,
    by: uid,
    at: now,
    ply,
  };
  const result = stationChessResult(history.chess, ply);
  const nextMatch = {
    ...match,
    fen: history.chess.fen(),
    moves: { ...history.normalizedMoves, [moveKey]: move },
    lastMoveAt: now,
    ...(result ? { result, endedAt: now } : {}),
  };
  return {
    ok: true,
    applied: true,
    duplicate: false,
    station: { ...station, match: nextMatch },
    move: { ply, san: move.san, by: uid, at: now },
    fen: nextMatch.fen,
    result,
  };
}

function stationPairMatches(match, uid, otherUid, matchId = null) {
  if (!isRecord(match) || (matchId && match.id !== matchId)) return false;
  return (
    (match.white === uid && match.black === otherUid) ||
    (match.white === otherUid && match.black === uid)
  );
}

function evictBlockedStationPair(station, uid, otherUid, matchId = null) {
  if (
    !isRecord(station) ||
    !safeRealtimeUid(uid) ||
    !safeRealtimeUid(otherUid) ||
    uid === otherUid ||
    !stationPairMatches(station.match, uid, otherUid, matchId)
  ) {
    return { applied: false, station };
  }
  const match = station.match;
  const seats = isRecord(station.seats) ? { ...station.seats } : {};
  [
    [match.white, match.whiteSeatSessionId],
    [match.black, match.blackSeatSessionId],
  ].forEach(([participantUid, sessionId]) => {
    if (
      STATION_CHESS_SESSION_ID.test(sessionId) &&
      seats[participantUid]?.sessionId === sessionId
    ) {
      delete seats[participantUid];
    }
  });
  const next = { ...station };
  delete next.match;
  if (Object.keys(seats).length) next.seats = seats;
  else delete next.seats;
  return {
    applied: true,
    station: Object.keys(next).length ? next : null,
  };
}

function blockedStationPaths(stations, uid, otherUid) {
  if (!isRecord(stations)) return [];
  const paths = [];
  Object.entries(stations).forEach(([room, roomStations]) => {
    if (!isRecord(roomStations)) return;
    Object.entries(roomStations).forEach(([stationId, station]) => {
      if (stationPairMatches(station?.match, uid, otherUid)) {
        paths.push(`stations/${room}/${stationId}`);
      }
    });
  });
  return paths.sort();
}

module.exports = {
  STATION_CHESS_INITIAL_FEN,
  STATION_CHESS_MAX_MOVES,
  STATION_CHESS_ROOM_ID,
  applyStationChessMove,
  blockedStationPaths,
  evictBlockedStationPair,
  normalizeStationChessMoveRequest,
  stationChessPairForRequest,
};
