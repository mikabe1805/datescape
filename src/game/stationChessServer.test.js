const {
  STATION_CHESS_INITIAL_FEN,
  STATION_CHESS_MAX_MOVES,
  applyStationChessMove,
  blockedStationPaths,
  evictBlockedStationPair,
  normalizeStationChessMoveRequest,
} = require("../../functions/stationChess");
const fs = require("node:fs");
const path = require("node:path");

const WHITE_SESSION = "a".repeat(32);
const BLACK_SESSION = "b".repeat(32);

function station(overrides = {}) {
  return {
    seats: {
      white: {
        name: "White",
        color: "#ffffff",
        sitAt: 1,
        sessionId: WHITE_SESSION,
      },
      black: {
        name: "Black",
        color: "#000000",
        sitAt: 2,
        sessionId: BLACK_SESSION,
      },
    },
    match: {
      id: "match-1",
      mode: "chess",
      white: "white",
      black: "black",
      whiteSeatSessionId: WHITE_SESSION,
      blackSeatSessionId: BLACK_SESSION,
      startedAt: 1,
      fen: STATION_CHESS_INITIAL_FEN,
      lastMoveAt: 1,
      ...overrides,
    },
  };
}

function action(uid, from, to, actionId, overrides = {}) {
  return {
    uid,
    matchId: "match-1",
    seatSessionId: uid === "white" ? WHITE_SESSION : BLACK_SESSION,
    actionId,
    from,
    to,
    promotion: "q",
    ...overrides,
  };
}

function apply(current, uid, from, to, actionId, now) {
  return applyStationChessMove(
    current,
    action(uid, from, to, actionId),
    now,
    { blocked: false },
  );
}

describe("server-authoritative station chess", () => {
  it("accepts only the exact coordinate-action request schema", () => {
    const request = {
      room: "afterlight-market-garden-v1",
      stationId: "chess--white_black",
      matchId: "match-1",
      seatSessionId: WHITE_SESSION,
      actionId: "chess:0123456789abcdef",
      from: "e2",
      to: "e4",
      promotion: "q",
    };
    expect(normalizeStationChessMoveRequest(request)).toEqual({
      ok: true,
      action: request,
    });
    expect(normalizeStationChessMoveRequest({ ...request, fen: "forged" })).toEqual(
      { ok: false },
    );
    expect(normalizeStationChessMoveRequest({ ...request, from: "z9" })).toEqual(
      { ok: false },
    );
    expect(normalizeStationChessMoveRequest({ ...request, promotion: "k" })).toEqual(
      { ok: false },
    );
  });

  it("validates the live seats, turn, move, and current FEN before committing", () => {
    const first = apply(
      station(),
      "white",
      "e2",
      "e4",
      "chess:0000000000000001",
      100,
    );
    expect(first.ok).toBe(true);
    expect(first.move).toEqual({ ply: 1, san: "e4", by: "white", at: 100 });
    expect(first.station.match.moves.m001).toEqual({
      actionId: "chess:0000000000000001",
      san: "e4",
      by: "white",
      at: 100,
      ply: 1,
    });
    expect(first.station.match.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    );

    expect(
      apply(
        first.station,
        "white",
        "d2",
        "d4",
        "chess:0000000000000002",
        101,
      ).code,
    ).toBe("wrong-turn");
    expect(
      apply(
        station(),
        "white",
        "e2",
        "e5",
        "chess:0000000000000003",
        102,
      ).code,
    ).toBe("illegal-move");

    const staleOpponent = station();
    staleOpponent.seats.black.sessionId = "c".repeat(32);
    expect(
      apply(
        staleOpponent,
        "white",
        "e2",
        "e4",
        "chess:0000000000000004",
        103,
      ).code,
    ).toBe("station-unavailable");

    const forgedFen = station({ fen: STATION_CHESS_INITIAL_FEN.replace(" w ", " b ") });
    expect(
      apply(
        forgedFen,
        "white",
        "e2",
        "e4",
        "chess:0000000000000005",
        104,
      ).code,
    ).toBe("invalid-chess-state");
  });

  it("requires an explicit unblocked decision and preserves idempotent actions", () => {
    const pending = applyStationChessMove(
      station(),
      action("white", "e2", "e4", "chess:0000000000000006"),
      105,
    );
    expect(pending.code).toBe("station-unavailable");

    const first = apply(
      station(),
      "white",
      "e2",
      "e4",
      "chess:0000000000000007",
      106,
    );
    const replay = apply(
      first.station,
      "white",
      "e2",
      "e4",
      "chess:0000000000000007",
      999,
    );
    expect(replay).toMatchObject({
      ok: true,
      applied: false,
      duplicate: true,
      station: first.station,
      move: first.move,
    });
  });

  it("records a server-derived terminal result and keeps its final action replayable", () => {
    let current = station();
    const sequence = [
      ["white", "f2", "f3", "chess:0000000000000010"],
      ["black", "e7", "e5", "chess:0000000000000011"],
      ["white", "g2", "g4", "chess:0000000000000012"],
      ["black", "d8", "h4", "chess:0000000000000013"],
    ];
    let result;
    sequence.forEach(([uid, from, to, actionId], index) => {
      result = apply(current, uid, from, to, actionId, 200 + index);
      expect(result.ok).toBe(true);
      current = result.station;
    });
    expect(result.result).toBe("black");
    expect(current.match).toMatchObject({ result: "black", endedAt: 203 });

    const replay = apply(
      current,
      "black",
      "d8",
      "h4",
      "chess:0000000000000013",
      999,
    );
    expect(replay).toMatchObject({ ok: true, duplicate: true, result: "black" });
    expect(
      apply(
        current,
        "white",
        "a2",
        "a3",
        "chess:0000000000000014",
        204,
      ).code,
    ).toBe("game-ended");
    expect(STATION_CHESS_MAX_MOVES).toBe(512);
  });
});

describe("session-safe blocked station eviction", () => {
  it("clears the matched station and both seat incarnations, preserving bystanders", () => {
    const current = station();
    current.decor = { lantern: true };
    current.seats.bystander = {
      name: "Third",
      color: "#abcdef",
      sitAt: 3,
      sessionId: "c".repeat(32),
    };
    const eviction = evictBlockedStationPair(current, "white", "black");
    expect(eviction.applied).toBe(true);
    expect(eviction.station).toEqual({
      decor: { lantern: true },
      seats: { bystander: current.seats.bystander },
    });
  });

  it("never removes a participant's newer seat or a newer match", () => {
    const reseated = station();
    reseated.seats.white = {
      ...reseated.seats.white,
      sessionId: "d".repeat(32),
    };
    const eviction = evictBlockedStationPair(reseated, "white", "black");
    expect(eviction.applied).toBe(true);
    expect(eviction.station.seats.white.sessionId).toBe("d".repeat(32));
    expect(eviction.station.seats.black).toBeUndefined();
    expect(eviction.station.match).toBeUndefined();

    const newerMatch = station({ id: "match-2" });
    expect(
      evictBlockedStationPair(newerMatch, "white", "black", "match-1"),
    ).toEqual({ applied: false, station: newerMatch });
  });

  it("finds candidate station paths without making stale destructive updates", () => {
    const target = station();
    const unrelated = station({ white: "third", black: "fourth" });
    expect(
      blockedStationPaths(
        {
          roomB: { unrelated },
          roomA: { target, other: unrelated },
        },
        "black",
        "white",
      ),
    ).toEqual(["stations/roomA/target"]);
  });
});

describe("station chess authority wiring", () => {
  const root = path.resolve(__dirname, "../..");
  const functionsSource = fs.readFileSync(
    path.join(root, "functions", "index.js"),
    "utf8",
  );
  const clientSource = fs.readFileSync(
    path.join(root, "src", "game", "useStation.js"),
    "utf8",
  );

  it("uses an authenticated callable, deletion admission, and pre/post block checks", () => {
    expect(functionsSource).toContain("exports.submitStationChessMove = onCall");
    expect(functionsSource).toContain("requireAuthenticatedUid(request)");
    expect(functionsSource).toContain("accountDeletionTombstoneRef(uid)");
    expect(functionsSource).toContain("accountDeletionTombstoneRef(otherUid)");
    expect(functionsSource).toContain("await stationRef.transaction");
    expect(
      functionsSource.match(/await stationChessPairIsUnblocked\(uid, otherUid\)/g),
    ).toHaveLength(2);
  });

  it("sends no client SAN, FEN, result, timestamp, or ply authority", () => {
    const start = clientSource.indexOf("const submitMove = useCallback");
    const end = clientSource.indexOf("const submitResonance", start);
    const submitSource = clientSource.slice(start, end);
    expect(submitSource).toContain(
      'httpsCallable(functions, "submitStationChessMove")',
    );
    expect(submitSource).toContain("from,");
    expect(submitSource).toContain("to,");
    expect(submitSource).toContain("promotion,");
    expect(submitSource).not.toMatch(/\bfen\b|\bsan\b|\bresult\b|\bply\b|serverTimestamp/);
  });
});
