import { act, renderHook, waitFor } from "@testing-library/react";
import * as database from "firebase/database";
import { httpsCallable } from "firebase/functions";
import {
  limitToFirst,
  limitToLast,
  onDisconnect,
  onValue,
  orderByChild,
  set,
} from "firebase/database";
import {
  hasAllCompletionAcks,
  nextChessMoveKey,
  orderedChessMoves,
  sendSignal,
  useSignals,
  useStation,
} from "./useStation";
import { LISTENING_CARD_IDS } from "./socialMoment";

const mockValueListeners = new Map();
const mockValueSnapshots = new Map();

jest.mock("../firebase", () => ({
  rtdb: { name: "test-rtdb" },
  auth: { currentUser: { uid: "player-a" } },
  functions: { name: "test-functions" },
}));

jest.mock("firebase/functions", () => ({
  httpsCallable: jest.fn(),
}));

jest.mock("firebase/database", () => {
  const disconnectHandles = [];
  return {
    ref: jest.fn((_database, path) => ({ path })),
    onValue: jest.fn((reference, listener) => {
      mockValueListeners.set(reference.path, listener);
      if (reference.path === "worldBlockFilters/player-a") {
        listener({ val: () => ({}) });
      } else if (mockValueSnapshots.has(reference.path)) {
        listener({ val: () => mockValueSnapshots.get(reference.path) });
      }
      return jest.fn();
    }),
    set: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
    push: jest.fn((reference) => ({ path: `${reference.path}/generated` })),
    onDisconnect: jest.fn((reference) => {
      const handle = {
        reference,
        remove: jest.fn(() => Promise.resolve()),
        cancel: jest.fn(() => Promise.resolve()),
      };
      disconnectHandles.push(handle);
      return handle;
    }),
    serverTimestamp: jest.fn(() => 1234),
    update: jest.fn(() => Promise.resolve()),
    get: jest.fn(() =>
      Promise.resolve({ exists: () => false, val: () => null }),
    ),
    runTransaction: jest.fn(() => Promise.resolve({ committed: true })),
    query: jest.fn((reference, ...constraints) => ({
      ...reference,
      constraints,
    })),
    orderByChild: jest.fn((child) => ({ type: "orderByChild", child })),
    limitToFirst: jest.fn((limit) => ({ type: "limitToFirst", limit })),
    limitToLast: jest.fn((limit) => ({ type: "limitToLast", limit })),
    __disconnectHandles: disconnectHandles,
  };
});

function emit(path, value) {
  mockValueSnapshots.set(path, value);
  const listener = mockValueListeners.get(path);
  if (listener) listener({ val: () => value });
}

describe("shared completion acknowledgement barrier", () => {
  it("requires matching receipts from both participants", () => {
    const match = {
      id: "duet-one",
      white: "player-a",
      black: "player-b",
      completionAcks: {
        "player-a": { matchId: "duet-one" },
        "player-b": { matchId: "older-duet" },
      },
    };
    expect(hasAllCompletionAcks(match)).toBe(false);
    expect(
      hasAllCompletionAcks({
        ...match,
        completionAcks: {
          ...match.completionAcks,
          "player-b": { matchId: "duet-one" },
        },
      }),
    ).toBe(true);
  });
});

describe("bounded chess move keys", () => {
  it("allocates only the finite m001 through m512 namespace", () => {
    expect(nextChessMoveKey(null)).toBe("m001");
    expect(nextChessMoveKey({ m001: {}, malformed: {} })).toBe("m002");
    expect(nextChessMoveKey({ m511: {} })).toBe("m512");
    expect(nextChessMoveKey({ m512: {} })).toBeNull();
  });

  it("orders only contiguous server-stamped plies, never client timestamps", () => {
    expect(
      orderedChessMoves({
        m002: { ply: 2, san: "e5", by: "player-b", at: 1 },
        m001: { ply: 1, san: "e4", by: "player-a", at: 999 },
      }),
    ).toEqual([
      { key: "m001", ply: 1, san: "e4", by: "player-a", at: 999 },
      { key: "m002", ply: 2, san: "e5", by: "player-b", at: 1 },
    ]);
    expect(
      orderedChessMoves({
        m001: { ply: 2, san: "e4", by: "player-a", at: 1 },
      }),
    ).toBeNull();
    expect(
      orderedChessMoves({
        m002: { ply: 2, san: "e5", by: "player-b", at: 1 },
      }),
    ).toBeNull();
  });
});

describe("world block projection readiness", () => {
  beforeEach(() => {
    mockValueListeners.clear();
    mockValueSnapshots.clear();
    jest.clearAllMocks();
    database.ref.mockImplementation((_database, path) => ({ path }));
    onValue.mockImplementation((reference, listener, errorListener) => {
      mockValueListeners.set(reference.path, listener);
      if (reference.path === "worldBlockFilters/player-a") {
        errorListener(new Error("permission denied"));
      } else if (mockValueSnapshots.has(reference.path)) {
        listener({ val: () => mockValueSnapshots.get(reference.path) });
      }
      return jest.fn();
    });
    set.mockResolvedValue(undefined);
  });

  it("does not publish a seat or subscribe to station state when safety is unready", async () => {
    const { result } = renderHook(() =>
      useStation({
        stationId: "listening-crescent",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "social",
      }),
    );

    await act(async () => {
      await result.current.sit();
    });

    expect(set).not.toHaveBeenCalled();
    expect(mockValueListeners.has("stations/afterlight-test/listening-crescent/seats")).toBe(false);
    expect(result.current.error).toMatch(/permission denied|safety filter/i);
  });

  it("does not subscribe to or expose signals when safety is unready", () => {
    const { result } = renderHook(() => useSignals());

    expect(mockValueListeners.has("signals/player-a")).toBe(false);
    expect(result.current.signals).toEqual([]);
  });
});

describe("bounded signal inbox", () => {
  beforeEach(() => {
    mockValueListeners.clear();
    mockValueSnapshots.clear();
    jest.clearAllMocks();
    database.ref.mockImplementation((_database, path) => ({ path }));
    database.query.mockImplementation((reference, ...constraints) => ({
      ...reference,
      constraints,
    }));
    orderByChild.mockImplementation((child) => ({
      type: "orderByChild",
      child,
    }));
    limitToLast.mockImplementation((limit) => ({
      type: "limitToLast",
      limit,
    }));
    onValue.mockImplementation((reference, listener) => {
      mockValueListeners.set(reference.path, listener);
      if (reference.path === "worldBlockFilters/player-a") {
        listener({ val: () => ({}) });
      } else if (mockValueSnapshots.has(reference.path)) {
        listener({ val: () => mockValueSnapshots.get(reference.path) });
      }
      return jest.fn();
    });
    set.mockResolvedValue(undefined);
    database.remove.mockResolvedValue(undefined);
  });

  it("uses the trusted callable and never sends identity or display fields", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { ok: true } });
    httpsCallable.mockReturnValue(invoke);

    const result = await sendSignal({
      toUid: "player-b",
      type: "wave",
    });

    expect(result.ok).toBe(true);
    expect(httpsCallable).toHaveBeenCalledWith(
      { name: "test-functions" },
      "submitWorldSignal",
    );
    expect(invoke).toHaveBeenCalledWith({
      room: "afterlight-market-garden-v1",
      toUid: "player-b",
      type: "wave",
      actionId: expect.stringMatching(/^world-signal:wave:/),
    });
    expect(invoke.mock.calls[0][0]).not.toHaveProperty("fromUid");
    expect(invoke.mock.calls[0][0]).not.toHaveProperty("fromName");
    expect(invoke.mock.calls[0][0]).not.toHaveProperty("fromColor");
    expect(set).not.toHaveBeenCalled();
  });

  it("reuses a failed action id and binds responses to the incoming invite", async () => {
    const invoke = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: { ok: true } })
      .mockResolvedValueOnce({ data: { ok: true } });
    httpsCallable.mockReturnValue(invoke);

    await sendSignal({ toUid: "player-b", type: "invite-chess" });
    await sendSignal({ toUid: "player-b", type: "invite-chess" });
    await sendSignal({
      toUid: "player-b",
      type: "invite-chess-accepted",
      replyToActionId: "world-signal:invite-chess:incoming-action",
    });

    expect(invoke.mock.calls[1][0].actionId).toBe(
      invoke.mock.calls[0][0].actionId,
    );
    expect(invoke.mock.calls[2][0]).toEqual(
      expect.objectContaining({
        type: "invite-chess-accepted",
        replyToActionId: "world-signal:invite-chess:incoming-action",
      }),
    );
  });

  it("subscribes to only the newest ten signals and keeps recipient cleanup", async () => {
    const { result, unmount } = renderHook(() => useSignals());

    await waitFor(() =>
      expect(mockValueListeners.has("signals/player-a")).toBe(true),
    );
    expect(orderByChild).toHaveBeenCalledWith("at");
    expect(limitToLast).toHaveBeenCalledWith(10);
    expect(database.query).toHaveBeenCalledWith(
      expect.objectContaining({ path: "signals/player-a" }),
      { type: "orderByChild", child: "at" },
      { type: "limitToLast", limit: 10 },
    );

    await act(async () => {
      await result.current.consume("player-b");
    });
    expect(database.remove).toHaveBeenCalledWith(
      expect.objectContaining({ path: "signals/player-a/player-b" }),
    );
    unmount();
  });
});

describe("useStation reconnect seating", () => {
  beforeEach(() => {
    mockValueListeners.clear();
    mockValueSnapshots.clear();
    jest.clearAllMocks();
    database.ref.mockImplementation((_database, path) => ({ path }));
    onValue.mockImplementation((reference, listener) => {
      mockValueListeners.set(reference.path, listener);
      if (reference.path === "worldBlockFilters/player-a") {
        listener({ val: () => ({}) });
      } else if (mockValueSnapshots.has(reference.path)) {
        listener({ val: () => mockValueSnapshots.get(reference.path) });
      }
      return jest.fn();
    });
    set.mockResolvedValue(undefined);
    database.remove.mockResolvedValue(undefined);
    database.push.mockImplementation((reference) => ({
      path: `${reference.path}/generated`,
    }));
    database.query.mockImplementation((reference, ...constraints) => ({
      ...reference,
      constraints,
    }));
    orderByChild.mockImplementation((child) => ({
      type: "orderByChild",
      child,
    }));
    limitToFirst.mockImplementation((limit) => ({
      type: "limitToFirst",
      limit,
    }));
    onDisconnect.mockImplementation((reference) => ({
      reference,
      remove: jest.fn(() => Promise.resolve()),
      cancel: jest.fn(() => Promise.resolve()),
    }));
    database.serverTimestamp.mockReturnValue(1234);
    database.update.mockResolvedValue(undefined);
    database.get.mockResolvedValue({ exists: () => false, val: () => null });
    database.runTransaction.mockResolvedValue({ committed: true });
    httpsCallable.mockReturnValue(
      jest.fn().mockResolvedValue({ data: { accepted: true } }),
    );
  });

  it("keeps sit and stand callbacks stable across profile-only changes", () => {
    const { result, rerender, unmount } = renderHook(
      ({ profile }) =>
        useStation({
          stationId: "listening-crescent",
          room: "afterlight-test",
          profile,
          mode: "social",
        }),
      {
        initialProps: {
          profile: { name: "Ari", color: "#75d8d0", intent: "meet" },
        },
      },
    );
    const firstSit = result.current.sit;
    const firstStand = result.current.stand;

    rerender({
      profile: { name: "Ari", color: "#c4a7ff", intent: "friends" },
    });

    expect(result.current.sit).toBe(firstSit);
    expect(result.current.stand).toBe(firstStand);
    unmount();
  });

  it("preserves queue order when refreshing a current seat profile", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ profile }) =>
        useStation({
          stationId: "listening-crescent",
          room: "afterlight-test",
          profile,
          mode: "social",
        }),
      {
        initialProps: {
          profile: { name: "Ari", color: "#75d8d0" },
        },
      },
    );

    await act(async () => result.current.sit());
    const sessionId = set.mock.calls[0][1].sessionId;
    database.get.mockResolvedValueOnce({
      val: () => ({
        name: "Ari",
        color: "#75d8d0",
        sitAt: 777,
        sessionId,
      }),
    });
    rerender({ profile: { name: "Ari", color: "#c4a7ff" } });

    await waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(set.mock.calls[1][1]).toEqual({
      name: "Ari",
      color: "#c4a7ff",
      sitAt: 777,
      sessionId,
    });
    unmount();
  });

  it("re-arms cleanup and republishes a desired seat after reconnect", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-loom",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
      }),
    );

    await act(async () => result.current.sit());
    expect(set).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    const initialSessionId = set.mock.calls[0][1].sessionId;
    expect(initialSessionId).toMatch(/^[a-f0-9]{32}$/);
    expect(set.mock.calls[0][1].sitAt).toBe(1234);

    act(() => emit(".info/connected", false));
    act(() => emit(".info/connected", true));

    await waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(onDisconnect).toHaveBeenCalledTimes(2);
    expect(set.mock.calls[1][1].sessionId).toBe(initialSessionId);
    expect(onValue).toHaveBeenCalledWith(
      expect.objectContaining({ path: ".info/connected" }),
      expect.any(Function),
    );

    unmount();
  });

  it("removes a late seat write when the player stands during publication", async () => {
    let resolveSeatWrite;
    set.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSeatWrite = resolve;
        }),
    );
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-loom",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
      }),
    );

    let sitPromise;
    act(() => {
      sitPromise = result.current.sit();
    });
    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    await act(async () => result.current.stand());
    await act(async () => {
      resolveSeatWrite();
      await sitPromise;
    });

    expect(database.remove).not.toHaveBeenCalled();
    const sessionId = set.mock.calls[0][1].sessionId;
    const seatTransactions = database.runTransaction.mock.calls.filter(
      ([reference]) =>
        reference.path ===
        "stations/afterlight-test/resonance-loom/seats/player-a",
    );
    expect(seatTransactions).toHaveLength(2);
    seatTransactions.forEach(([, removeIfCurrent, options]) => {
      expect(removeIfCurrent({ sessionId })).toBeNull();
      expect(removeIfCurrent({ sessionId: "f".repeat(32) })).toBeUndefined();
      expect(options).toEqual({ applyLocally: false });
    });
    expect(onDisconnect.mock.results[0].value.cancel).toHaveBeenCalled();
    unmount();
  });

  it("does not cancel a newly re-armed seat when leave and re-sit overlap", async () => {
    let resolveLeave;
    let staleRemove;
    database.runTransaction.mockImplementationOnce(
      (_reference, updateSeat) =>
        new Promise((resolve) => {
          resolveLeave = resolve;
          staleRemove = updateSeat;
        }),
    );
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-loom",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
      }),
    );

    await act(async () => result.current.sit());
    const firstSeat = set.mock.calls[0][1];
    let leavePromise;
    act(() => {
      leavePromise = result.current.stand();
    });
    await waitFor(() =>
      expect(database.runTransaction).toHaveBeenCalledTimes(1),
    );
    await act(async () => result.current.sit());
    const secondSeat = set.mock.calls[1][1];
    expect(secondSeat.sessionId).toMatch(/^[a-f0-9]{32}$/);
    expect(secondSeat.sessionId).not.toBe(firstSeat.sessionId);
    expect(staleRemove(firstSeat)).toBeNull();
    expect(staleRemove(secondSeat)).toBeUndefined();
    expect(onDisconnect).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveLeave({
        committed: false,
        snapshot: { exists: () => true },
      });
      await leavePromise;
    });
    const firstHandle = onDisconnect.mock.results[0].value;
    const secondHandle = onDisconnect.mock.results[1].value;
    expect(firstHandle.cancel).not.toHaveBeenCalled();
    expect(secondHandle.cancel).not.toHaveBeenCalled();

    await act(async () => result.current.stand());
    expect(secondHandle.cancel).toHaveBeenCalled();
    expect(database.remove).not.toHaveBeenCalled();
    unmount();
  });

  it("subscribes to private match data only while the local seat exists", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "listening-crescent",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "social",
      }),
    );
    const matchPath =
      "stations/afterlight-test/listening-crescent/match";
    const seatsPath =
      "stations/afterlight-test/listening-crescent/seats";

    expect(database.query).toHaveBeenCalledWith(
      expect.objectContaining({ path: seatsPath }),
      { type: "orderByChild", child: "sitAt" },
      { type: "limitToFirst", limit: 2 },
    );
    expect(mockValueListeners.has(`${seatsPath}/player-a`)).toBe(true);
    expect(mockValueListeners.has(matchPath)).toBe(false);
    act(() => {
      emit(seatsPath, {
        "player-b": {
          name: "Bea",
          color: "#c4a7ff",
          sitAt: 100,
          sessionId: "b".repeat(32),
        },
      });
    });
    expect(mockValueListeners.has(matchPath)).toBe(false);
    act(() => {
      emit(`${seatsPath}/player-a`, {
        name: "Ari",
        color: "#75d8d0",
        sitAt: 200,
        sessionId: "a".repeat(32),
      });
    });
    await waitFor(() => expect(result.current.seated).toBe(true));
    expect(mockValueListeners.has(matchPath)).toBe(false);

    act(() => {
      emit(seatsPath, {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 200,
          sessionId: "a".repeat(32),
        },
        "player-b": {
          name: "Bea",
          color: "#c4a7ff",
          sitAt: 100,
          sessionId: "b".repeat(32),
        },
      });
    });
    await waitFor(() => expect(mockValueListeners.has(matchPath)).toBe(true));

    act(() => {
      emit(matchPath, {
        id: "listening-private",
        mode: "social",
        white: "player-a",
        black: "player-b",
        whiteSeatSessionId: "a".repeat(32),
        blackSeatSessionId: "b".repeat(32),
      });
    });
    await waitFor(() =>
      expect(result.current.match?.id).toBe("listening-private"),
    );

    act(() => emit(seatsPath, {}));
    await waitFor(() => expect(result.current.match).toBeNull());
    const matchListenerIndex = onValue.mock.calls.findIndex(
      ([reference]) => reference.path === matchPath,
    );
    expect(onValue.mock.results[matchListenerIndex].value).toHaveBeenCalled();
    unmount();
  });

  it("creates a missing match atomically without replacing an existing one", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-duet",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
      }),
    );

    await act(async () => result.current.sit());

    act(() => {
      emit("stations/afterlight-test/resonance-duet/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: "a".repeat(32),
        },
        "player-b": {
          name: "Bea",
          color: "#c4a7ff",
          sitAt: 200,
          sessionId: "b".repeat(32),
        },
      });
      emit("stations/afterlight-test/resonance-duet/match", null);
    });

    await waitFor(() => expect(database.runTransaction).toHaveBeenCalled());
    const updateMatch = database.runTransaction.mock.calls[0][1];
    expect(updateMatch({ white: "older-a", black: "older-b" })).toBeUndefined();
    expect(updateMatch(null)).toEqual(
      expect.objectContaining({
        mode: "resonance",
        white: "player-a",
        black: "player-b",
        whiteSeatSessionId: "a".repeat(32),
        blackSeatSessionId: "b".repeat(32),
      }),
    );
    unmount();
  });

  it("owns the authored social card id on the synchronized match", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "listening-crescent",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "social",
      }),
    );

    await act(async () => result.current.sit());

    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: "c".repeat(32),
        },
        "player-b": {
          name: "Bea",
          color: "#c4a7ff",
          sitAt: 200,
          sessionId: "d".repeat(32),
        },
      });
      emit("stations/afterlight-test/listening-crescent/match", null);
    });

    await waitFor(() => expect(database.runTransaction).toHaveBeenCalled());
    const createMatch = database.runTransaction.mock.calls[0][1];
    const created = createMatch(null);
    expect(created.mode).toBe("social");
    expect(created.whiteSeatSessionId).toBe("c".repeat(32));
    expect(created.blackSeatSessionId).toBe("d".repeat(32));
    expect(LISTENING_CARD_IDS).toContain(created.socialCardId);
    unmount();
  });

  it("does not create a match from a stale seat when not locally sitting", async () => {
    const { unmount } = renderHook(() =>
      useStation({
        stationId: "listening-crescent",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "social",
      }),
    );

    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {
        "player-a": { name: "Ari", color: "#75d8d0", sitAt: 100 },
        "player-b": { name: "Bea", color: "#c4a7ff", sitAt: 200 },
      });
      emit("stations/afterlight-test/listening-crescent/match", null);
    });
    await act(async () => Promise.resolve());

    expect(database.runTransaction).not.toHaveBeenCalled();
    unmount();
  });

  it("does not eject a queued player from somebody else's blocked pairing", async () => {
    const { unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-duet",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
        excludedUids: ["player-b"],
      }),
    );

    act(() => {
      emit("stations/afterlight-test/resonance-duet/match", {
        id: "other-pairing",
        white: "player-b",
        black: "player-c",
      });
      emit("stations/afterlight-test/resonance-duet/seats", {
        "player-a": { name: "Ari", sitAt: 100 },
        "player-b": { name: "Bea", sitAt: 200 },
        "player-c": { name: "Cam", sitAt: 300 },
      });
    });

    await act(async () => Promise.resolve());
    expect(database.remove).not.toHaveBeenCalled();
    unmount();
  });

  it("releases a chess seat and match when its paired user becomes blocked", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "chess-table",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "chess",
      }),
    );
    await act(async () => result.current.sit());
    const playerSessionId = set.mock.calls[0][1].sessionId;
    act(() => {
      emit("stations/afterlight-test/chess-table/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: playerSessionId,
        },
        "player-b": {
          name: "Bea",
          color: "#c4a7ff",
          sitAt: 200,
          sessionId: "b".repeat(32),
        },
      });
      emit("stations/afterlight-test/chess-table/match", {
        id: "chess-private",
        mode: "chess",
        white: "player-a",
        black: "player-b",
        whiteSeatSessionId: playerSessionId,
        blackSeatSessionId: "b".repeat(32),
      });
    });
    await waitFor(() =>
      expect(result.current.match?.id).toBe("chess-private"),
    );
    database.runTransaction.mockClear();

    act(() => {
      emit("worldBlockFilters/player-a", { "player-b": true });
    });
    await waitFor(() =>
      expect(database.runTransaction).toHaveBeenCalledTimes(2),
    );
    const cleanupPaths = database.runTransaction.mock.calls.map(
      ([reference]) => reference.path,
    );
    expect(cleanupPaths).toContain(
      "stations/afterlight-test/chess-table/seats/player-a",
    );
    expect(cleanupPaths).toContain(
      "stations/afterlight-test/chess-table/match",
    );
    unmount();
  });

  it("binds a resonance note transaction to the captured match id", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-duet",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
      }),
    );
    const activeMatch = {
      id: "duet-one",
      mode: "resonance",
      white: "player-a",
      black: "player-b",
      whiteSeatSessionId: "a".repeat(32),
      blackSeatSessionId: "b".repeat(32),
    };

    act(() => {
      emit("stations/afterlight-test/resonance-duet/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: "a".repeat(32),
        },
        "player-b": {
          name: "Bea",
          color: "#c4a7ff",
          sitAt: 200,
          sessionId: "b".repeat(32),
        },
      });
      emit("stations/afterlight-test/resonance-duet/match", activeMatch);
    });
    await waitFor(() => expect(result.current.match?.id).toBe("duet-one"));
    database.runTransaction.mockClear();

    await act(async () => {
      await result.current.submitResonance(0, "tide", 0.8);
    });

    expect(database.runTransaction).toHaveBeenCalledTimes(1);
    const [transactionRef, updateMatch, options] =
      database.runTransaction.mock.calls[0];
    expect(transactionRef.path).toBe(
      "stations/afterlight-test/resonance-duet/match/notes/0/player-a",
    );
    expect(options).toEqual({ applyLocally: false });
    expect(updateMatch({ tone: "ember" })).toBeUndefined();
    expect(updateMatch(null)).toEqual(
      expect.objectContaining({
        tone: "tide",
        accuracy: 0.8,
        matchId: "duet-one",
      }),
    );
    unmount();
  });

  it("submits only a coordinate intent to the authenticated chess callable", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "chess-table",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "chess",
      }),
    );
    act(() => {
      emit("stations/afterlight-test/chess-table/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: "a".repeat(32),
        },
        "player-b": {
          name: "Bea",
          color: "#c4a7ff",
          sitAt: 200,
          sessionId: "b".repeat(32),
        },
      });
      emit("stations/afterlight-test/chess-table/match", {
        id: "chess-one",
        mode: "chess",
        white: "player-a",
        black: "player-b",
        whiteSeatSessionId: "a".repeat(32),
        blackSeatSessionId: "b".repeat(32),
      });
    });
    await waitFor(() => expect(result.current.match?.id).toBe("chess-one"));
    set.mockClear();
    const invoke = jest.fn().mockResolvedValue({
      data: {
        accepted: true,
        move: { ply: 1, san: "e4", by: "player-a", at: 100 },
      },
    });
    httpsCallable.mockReturnValueOnce(invoke);

    let response;
    await act(async () => {
      response = await result.current.submitMove({ from: "e2", to: "e4" });
    });

    expect(httpsCallable).toHaveBeenCalledWith(
      { name: "test-functions" },
      "submitStationChessMove",
    );
    expect(invoke).toHaveBeenCalledWith({
      room: "afterlight-test",
      stationId: "chess-table",
      matchId: "chess-one",
      seatSessionId: "a".repeat(32),
      actionId: expect.stringMatching(/^chess:[a-f0-9]{32}$/),
      from: "e2",
      to: "e4",
      promotion: "q",
    });
    expect(response).toMatchObject({ ok: true, accepted: true });
    expect(set).not.toHaveBeenCalled();
    expect(database.update).not.toHaveBeenCalled();
    unmount();
  });

  it("seals a social choice once under the seated participant's uid", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "listening-crescent",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "social",
      }),
    );
    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {
        "player-a": { name: "Ari", color: "#75d8d0", sitAt: 100 },
      });
      emit("stations/afterlight-test/listening-crescent/match", {
        id: "listening-one",
        mode: "social",
        white: "player-a",
        black: "player-b",
      });
    });
    await waitFor(() => expect(result.current.seated).toBe(true));
    database.runTransaction.mockClear();

    let sealedChoice;
    database.runTransaction.mockImplementationOnce(
      async (_reference, updateChoice) => {
        sealedChoice = updateChoice(null);
        expect(updateChoice({
          matchId: "listening-one",
          choiceId: "a",
          chosenAt: 1200,
        })).toBeUndefined();
        return { committed: true };
      },
    );
    let choiceResult;
    await act(async () => {
      choiceResult = await result.current.submitSocialChoice("b");
    });

    expect(choiceResult).toEqual({ ok: true });
    expect(database.runTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "stations/afterlight-test/listening-crescent/match/socialChoices/player-a",
      }),
      expect.any(Function),
      { applyLocally: false },
    );
    expect(sealedChoice).toEqual({
      matchId: "listening-one",
      choiceId: "b",
      chosenAt: 1234,
    });
    expect(Object.keys(sealedChoice)).toEqual([
      "matchId",
      "choiceId",
      "chosenAt",
    ]);
    unmount();
  });

  it("sanitizes current-match social choices and exposes the local choice", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "listening-crescent",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "social",
      }),
    );
    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: "a".repeat(32),
        },
      });
      emit("stations/afterlight-test/listening-crescent/match", {
        id: "listening-one",
        mode: "social",
        white: "player-a",
        black: "player-b",
        whiteSeatSessionId: "a".repeat(32),
        blackSeatSessionId: "b".repeat(32),
        socialChoices: {
          "player-a": {
            matchId: "listening-one",
            choiceId: "pass",
            chosenAt: 1200,
            profile: { name: "must not escape" },
          },
          "player-b": {
            matchId: "older-listening",
            choiceId: "c",
            chosenAt: 1210,
          },
          outsider: {
            matchId: "listening-one",
            choiceId: "a",
            chosenAt: 1220,
          },
        },
      });
    });

    await waitFor(() =>
      expect(result.current.socialChoice).toEqual({
        matchId: "listening-one",
        choiceId: "pass",
        chosenAt: 1200,
      }),
    );
    expect(result.current.socialChoices).toEqual({
      "player-a": {
        matchId: "listening-one",
        choiceId: "pass",
        chosenAt: 1200,
      },
    });
    unmount();
  });

  it("rejects invalid, unseated, and already-sealed social choices", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "listening-crescent",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "social",
      }),
    );
    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: "a".repeat(32),
        },
      });
      emit("stations/afterlight-test/listening-crescent/match", {
        id: "listening-one",
        mode: "social",
        white: "player-a",
        black: "player-b",
        whiteSeatSessionId: "a".repeat(32),
        blackSeatSessionId: "b".repeat(32),
      });
    });
    await waitFor(() => expect(result.current.match?.id).toBe("listening-one"));
    database.runTransaction.mockClear();

    await expect(result.current.submitSocialChoice("d")).resolves.toEqual({
      ok: false,
      error: "Invalid active listening choice",
    });
    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {});
    });
    await waitFor(() => expect(result.current.match).toBeNull());
    await expect(result.current.submitSocialChoice("a")).resolves.toEqual({
      ok: false,
      error: "Invalid active listening choice",
    });
    expect(database.runTransaction).not.toHaveBeenCalled();

    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: "a".repeat(32),
        },
      });
    });
    await waitFor(() => expect(result.current.match?.id).toBe("listening-one"));
    database.runTransaction.mockResolvedValueOnce({ committed: false });
    await expect(result.current.submitSocialChoice("c")).resolves.toEqual({
      ok: false,
      error: "This listening choice was already sealed",
    });
    unmount();
  });

  it("acknowledges completion once with a participant-owned match receipt", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-duet",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
      }),
    );
    const activeMatch = {
      id: "duet-one",
      mode: "resonance",
      white: "player-a",
      black: "player-b",
    };

    act(() => {
      emit("stations/afterlight-test/resonance-duet/seats", {
        "player-a": { name: "Ari", color: "#75d8d0", sitAt: 100 },
      });
      emit("stations/afterlight-test/resonance-duet/match", activeMatch);
    });
    await waitFor(() => expect(result.current.seated).toBe(true));
    database.runTransaction.mockClear();

    let firstReceipt;
    database.runTransaction.mockImplementationOnce(
      async (_reference, updateReceipt) => {
        firstReceipt = updateReceipt(null);
        expect(updateReceipt(firstReceipt)).toBe(firstReceipt);
        return { committed: true };
      },
    );
    let acknowledgementResult;
    await act(async () => {
      acknowledgementResult = await result.current.acknowledgeCompletion();
    });

    expect(acknowledgementResult).toEqual({ ok: true });
    expect(database.runTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "stations/afterlight-test/resonance-duet/match/completionAcks/player-a",
      }),
      expect.any(Function),
      { applyLocally: false },
    );
    expect(firstReceipt).toEqual({
      matchId: "duet-one",
      acknowledgedAt: 1234,
    });
    expect(Object.keys(firstReceipt)).toEqual(["matchId", "acknowledgedAt"]);
    unmount();
  });

  it("surfaces current-match acknowledgement state and rejects an unseated write", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "listening-crescent",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "social",
      }),
    );
    const completionAcks = {
      "player-a": { matchId: "listening-one", acknowledgedAt: 1234 },
      "player-b": { matchId: "listening-one", acknowledgedAt: 1240 },
    };

    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: "a".repeat(32),
        },
      });
      emit("stations/afterlight-test/listening-crescent/match", {
        id: "listening-one",
        mode: "social",
        white: "player-a",
        black: "player-b",
        whiteSeatSessionId: "a".repeat(32),
        blackSeatSessionId: "b".repeat(32),
        completionAcks,
      });
    });
    await waitFor(() =>
      expect(result.current.completionAcknowledged).toBe(true),
    );
    expect(result.current.completionAcks).toBe(completionAcks);
    expect(result.current.fullyAcknowledgedMatchIds).toContain(
      "listening-one",
    );
    act(() => {
      emit("stations/afterlight-test/listening-crescent/seats", {});
    });
    await waitFor(() => expect(result.current.match).toBeNull());
    database.runTransaction.mockClear();

    let acknowledgementResult;
    await act(async () => {
      acknowledgementResult = await result.current.acknowledgeCompletion();
    });

    expect(acknowledgementResult).toEqual({
      ok: false,
      error: "No active seated shared moment",
    });
    expect(database.runTransaction).not.toHaveBeenCalled();
    unmount();
  });

  it("ends only the match captured by an explicit leave", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-duet",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
      }),
    );
    const activeMatch = {
      id: "duet-one",
      mode: "resonance",
      white: "player-a",
      black: "player-b",
    };
    await act(async () => result.current.sit());
    const seatSessionId = set.mock.calls[0][1].sessionId;
    activeMatch.whiteSeatSessionId = seatSessionId;
    activeMatch.blackSeatSessionId = "b".repeat(32);
    act(() => {
      emit("stations/afterlight-test/resonance-duet/seats", {
        "player-a": {
          name: "Ari",
          color: "#75d8d0",
          sitAt: 100,
          sessionId: seatSessionId,
        },
      });
      emit("stations/afterlight-test/resonance-duet/match", activeMatch);
    });
    await waitFor(() => expect(result.current.match?.id).toBe("duet-one"));
    database.runTransaction.mockClear();
    let resolveSeatRemoval;
    database.runTransaction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSeatRemoval = resolve;
        }),
    );

    let leavePromise;
    act(() => {
      leavePromise = result.current.stand();
    });
    await waitFor(() => expect(database.runTransaction).toHaveBeenCalled());
    act(() => {
      emit("stations/afterlight-test/resonance-duet/match", {
        ...activeMatch,
        id: "duet-two",
      });
    });
    await act(async () => {
      resolveSeatRemoval({ committed: true });
      await leavePromise;
    });

    const matchTransactions = database.runTransaction.mock.calls.filter(
      ([reference]) =>
        reference.path === "stations/afterlight-test/resonance-duet/match",
    );
    expect(matchTransactions).toHaveLength(1);
    const [transactionRef, clearMatch, options] =
      matchTransactions[0];
    expect(transactionRef.path).toBe(
      "stations/afterlight-test/resonance-duet/match",
    );
    expect(options).toEqual({ applyLocally: false });
    expect(clearMatch({ ...activeMatch, id: "duet-two" })).toBeUndefined();
    expect(clearMatch(activeMatch)).toBeNull();
    unmount();
  });

  it("preserves a shared match briefly after the first acknowledged player leaves", async () => {
    const { result, unmount } = renderHook(() =>
      useStation({
        stationId: "resonance-duet",
        room: "afterlight-test",
        profile: { name: "Ari", color: "#75d8d0" },
        mode: "resonance",
      }),
    );
    const activeMatch = {
      id: "duet-one",
      mode: "resonance",
      white: "player-a",
      black: "player-b",
      completionAcks: {
        "player-a": { matchId: "duet-one", acknowledgedAt: 1234 },
      },
    };
    act(() => {
      emit("stations/afterlight-test/resonance-duet/seats", {
        "player-a": { name: "Ari", color: "#75d8d0", sitAt: 100 },
      });
      emit("stations/afterlight-test/resonance-duet/match", activeMatch);
    });
    await waitFor(() => expect(result.current.match?.id).toBe("duet-one"));
    await act(async () => result.current.sit());
    database.runTransaction.mockClear();

    await act(async () => result.current.stand());

    expect(database.remove).not.toHaveBeenCalled();
    expect(database.runTransaction).toHaveBeenCalledTimes(1);
    expect(database.runTransaction.mock.calls[0][0].path).toBe(
      "stations/afterlight-test/resonance-duet/seats/player-a",
    );
    unmount();
  });
});
