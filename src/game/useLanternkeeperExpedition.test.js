import { act, renderHook } from "@testing-library/react";
import {
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref,
} from "firebase/database";
import { useLanternkeeperExpedition } from "./useLanternkeeperExpedition";
import {
  listLanternkeeperExpeditions,
  startLanternkeeperExpedition,
} from "./lanternkeeperExpeditionBridge";

const mockValueListeners = new Map();

jest.mock("../firebase", () => ({
  rtdb: { name: "test-rtdb" },
}));

jest.mock("firebase/database", () => ({
  ref: jest.fn((_database, path) => ({ path })),
  orderByChild: jest.fn((child) => ({ type: "orderByChild", child })),
  limitToLast: jest.fn((limit) => ({ type: "limitToLast", limit })),
  query: jest.fn((reference, ...constraints) => ({
    ...reference,
    constraints,
  })),
  onValue: jest.fn((reference, listener) => {
    mockValueListeners.set(reference.path, listener);
    if (reference.path === ".info/serverTimeOffset") {
      listener({ val: () => 0 });
    }
    return jest.fn();
  }),
}));

jest.mock("./lanternkeeperExpeditionBridge", () => ({
  contributeLanternkeeperExpedition: jest.fn(() => Promise.resolve({})),
  getLanternkeeperExpedition: jest.fn(() => Promise.resolve({})),
  joinLanternkeeperExpedition: jest.fn(() => Promise.resolve({})),
  leaveLanternkeeperExpedition: jest.fn(() => Promise.resolve({})),
  listLanternkeeperExpeditions: jest.fn(() =>
    Promise.resolve({ expeditions: [] }),
  ),
  startLanternkeeperExpedition: jest.fn(() => Promise.resolve({})),
}));

function emit(path, value) {
  const listener = mockValueListeners.get(path);
  if (!listener) throw new Error(`No listener registered for ${path}`);
  listener({ val: () => value });
}

function publicExpedition(instanceId, startedAt, expiresAt) {
  return {
    id: "lanternkeeper-expedition",
    definitionId: "lanternkeeper-expedition-v1",
    room: "afterlight-market-garden-v1",
    instanceId,
    revision: 1,
    phase: "conservatory",
    startedAt,
    echoAvailableAt: startedAt + 90_000,
    expiresAt,
    completedAt: null,
    activeMemberCount: 1,
    memberCapacity: 4,
    openSlots: 3,
    canJoin: true,
    stageIndex: 0,
    targetStates: {},
    resultMode: null,
  };
}

describe("useLanternkeeperExpedition public board", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(1_000_000));
    mockValueListeners.clear();
    jest.clearAllMocks();
    ref.mockImplementation((_database, path) => ({ path }));
    orderByChild.mockImplementation((child) => ({
      type: "orderByChild",
      child,
    }));
    limitToLast.mockImplementation((limit) => ({
      type: "limitToLast",
      limit,
    }));
    query.mockImplementation((reference, ...constraints) => ({
      ...reference,
      constraints,
    }));
    onValue.mockImplementation((reference, listener) => {
      mockValueListeners.set(reference.path, listener);
      if (reference.path === ".info/serverTimeOffset") {
        listener({ val: () => 0 });
      }
      return jest.fn();
    });
    listLanternkeeperExpeditions.mockResolvedValue({ expeditions: [] });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("subscribes to only the twelve newest started routes", () => {
    const { unmount } = renderHook(() =>
      useLanternkeeperExpedition({ sessionKey: "player-a" }),
    );

    const publicReference = { path: "worldExpeditions/lanternkeeper-expedition/public" };
    expect(ref).toHaveBeenCalledWith(
      { name: "test-rtdb" },
      publicReference.path,
    );
    expect(orderByChild).toHaveBeenCalledWith("startedAt");
    expect(limitToLast).toHaveBeenCalledWith(12);
    expect(query).toHaveBeenCalledWith(
      publicReference,
      { type: "orderByChild", child: "startedAt" },
      { type: "limitToLast", limit: 12 },
    );
    expect(onValue).toHaveBeenCalledWith(
      expect.objectContaining({
        path: publicReference.path,
        constraints: [
          { type: "orderByChild", child: "startedAt" },
          { type: "limitToLast", limit: 12 },
        ],
      }),
      expect.any(Function),
      expect.any(Function),
    );

    unmount();
  });

  it("rerenders at each public row expiry even without a selected route", () => {
    const { result, unmount } = renderHook(() =>
      useLanternkeeperExpedition({ sessionKey: "player-a" }),
    );

    act(() => {
      emit("worldExpeditions/lanternkeeper-expedition/public", {
        first: publicExpedition("route-first", 900_000, 1_001_000),
        second: publicExpedition("route-second", 950_000, 1_002_000),
      });
    });
    const initialServerNow = result.current.rendererState.serverNow;

    act(() => jest.advanceTimersByTime(1_024));
    expect(result.current.rendererState.serverNow).toBe(initialServerNow);

    act(() => jest.advanceTimersByTime(1));
    const firstExpiryServerNow = result.current.rendererState.serverNow;
    expect(firstExpiryServerNow).toBe(1_001_025);

    act(() => jest.advanceTimersByTime(1_000));
    expect(result.current.rendererState.serverNow).toBe(1_002_025);

    unmount();
  });

  it("keeps the selected route live outside the bounded board query", async () => {
    const selected = publicExpedition("route-selected", 990_000, 1_100_000);
    startLanternkeeperExpedition.mockResolvedValueOnce({
      applied: true,
      expedition: selected,
      personal: {
        instanceId: selected.instanceId,
        joined: true,
        active: true,
        joinedAt: 990_000,
        leftAt: null,
        contributedTargets: [],
        availableTargets: ["conservatory-scan"],
        canLeave: true,
      },
    });
    const { result, unmount } = renderHook(() =>
      useLanternkeeperExpedition({ sessionKey: "player-a" }),
    );

    await act(async () => {
      await result.current.start();
    });

    const selectedPath =
      "worldExpeditions/lanternkeeper-expedition/public/route-selected";
    expect(ref).toHaveBeenCalledWith({ name: "test-rtdb" }, selectedPath);
    expect(onValue).toHaveBeenCalledWith(
      expect.objectContaining({ path: selectedPath }),
      expect.any(Function),
      expect.any(Function),
    );

    unmount();
  });
});
