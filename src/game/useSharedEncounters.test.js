import { act, renderHook, waitFor } from "@testing-library/react";
import {
  createSharedEncounterActionId,
  listSharedEncounters,
  respondSharedEncounter,
  sanitizeSharedEncounter,
} from "./sharedEncounter";
import { useSharedEncounters } from "./useSharedEncounters";

jest.mock("./sharedEncounter", () => ({
  createSharedEncounterActionId: jest.fn(),
  listSharedEncounters: jest.fn(),
  respondSharedEncounter: jest.fn(),
  sanitizeSharedEncounter: jest.fn((value) => value),
}));

const encounter = {
  id: "encounter:one",
  sourceId: "resonance:one",
  mode: "resonance",
  opponent: { uid: "b", name: "Bea" },
  response: null,
  state: "open",
  createdAt: 1_000,
  expiresAt: 5_000,
  matchId: null,
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useSharedEncounters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sanitizeSharedEncounter.mockImplementation((value) => value);
    createSharedEncounterActionId.mockReturnValue(
      "shared-encounter:spark:action",
    );
    listSharedEncounters.mockResolvedValue({ encounters: [], error: null });
  });

  it("loads a bounded list and exposes explicit Spark and pass helpers", async () => {
    listSharedEncounters.mockResolvedValue({
      encounters: [encounter],
      error: null,
    });
    respondSharedEncounter.mockResolvedValue({
      encounter: { ...encounter, response: "spark", state: "pending" },
      mutual: false,
      matchId: null,
      error: null,
    });
    const { result } = renderHook(() =>
      useSharedEncounters({ sessionKey: "user-a", limit: 6 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listSharedEncounters).toHaveBeenCalledWith({ limit: 6 });
    expect(result.current.encounters).toEqual([encounter]);

    await act(async () => {
      await result.current.sendSpark("encounter:one");
    });
    expect(respondSharedEncounter).toHaveBeenCalledWith({
      encounterId: "encounter:one",
      response: "spark",
      actionId: "shared-encounter:spark:action",
    });
    await waitFor(() =>
      expect(result.current.encounters[0].state).toBe("pending"),
    );
    expect(result.current.busy).toBe(false);
    expect(sanitizeSharedEncounter).toHaveBeenCalled();
  });

  it("shows mutation busy state without blocking unrelated encounter state", async () => {
    listSharedEncounters.mockResolvedValue({
      encounters: [encounter],
      error: null,
    });
    const response = deferred();
    respondSharedEncounter.mockReturnValue(response.promise);
    const { result } = renderHook(() =>
      useSharedEncounters({ sessionKey: "user-a" }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let request;
    act(() => {
      request = result.current.pass("encounter:one");
    });
    expect(result.current.busyEncounterId).toBe("encounter:one");
    expect(result.current.encounters[0].state).toBe("open");

    await act(async () => {
      response.resolve({
        encounter: { ...encounter, response: "pass", state: "passed" },
        mutual: false,
        matchId: null,
        error: null,
      });
      await request;
    });
    expect(result.current.busyEncounterId).toBeNull();
    await waitFor(() =>
      expect(result.current.encounters[0].state).toBe("passed"),
    );
  });

  it("ignores list results from a prior auth session", async () => {
    const first = deferred();
    const second = deferred();
    listSharedEncounters
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ sessionKey }) => useSharedEncounters({ sessionKey }),
      { initialProps: { sessionKey: "user-a" } },
    );

    rerender({ sessionKey: "user-b" });
    await act(async () => {
      second.resolve({
        encounters: [{ ...encounter, id: "encounter:new" }],
        error: null,
      });
    });
    await waitFor(() =>
      expect(result.current.encounters[0]?.id).toBe("encounter:new"),
    );

    await act(async () => {
      first.resolve({ encounters: [encounter], error: null });
    });
    expect(result.current.encounters[0]?.id).toBe("encounter:new");
  });

  it("does not let a callback captured by a prior account issue a mutation", async () => {
    const { result, rerender } = renderHook(
      ({ sessionKey }) => useSharedEncounters({ sessionKey }),
      { initialProps: { sessionKey: "user-a" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const staleSpark = result.current.sendSpark;

    rerender({ sessionKey: "user-b" });
    let response;
    await act(async () => {
      response = await staleSpark("encounter:one");
    });

    expect(response).toEqual({ ignored: true });
    expect(respondSharedEncounter).not.toHaveBeenCalled();
  });

  it("clears private state and makes no request when disabled", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useSharedEncounters({ enabled, sessionKey: "user-a" }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ enabled: false });
    expect(result.current.encounters).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
