import { act, renderHook } from "@testing-library/react";
import { useResonanceEcho } from "./useResonanceEcho";
import {
  completeResonanceEcho,
  pollResonanceEcho,
  startResonanceEcho,
} from "./resonanceEcho";

jest.mock("./resonanceEcho", () => {
  const actual = jest.requireActual("./resonanceEcho");
  return {
    ...actual,
    completeResonanceEcho: jest.fn(),
    pollResonanceEcho: jest.fn(),
    startResonanceEcho: jest.fn(),
  };
});

function echo(phase, serverNow = 1_000) {
  return {
    version: 1,
    roomId: "afterlight-market-garden-v1",
    questId: "afterlight-sunthread",
    attemptId: "resonance-echo-attempt:" + "a".repeat(64),
    phase,
    startedAt: 1_000,
    maturesAt: 91_000,
    completedAt: phase === "completed" ? 91_000 : null,
    remainingMs: phase === "waiting" ? 90_000 : 0,
    canComplete: phase === "mature",
    serverNow,
  };
}

describe("useResonanceEcho", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(1_000);
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  test("starts and stores the trusted wait projection", async () => {
    startResonanceEcho.mockResolvedValue({
      applied: true,
      echo: echo("waiting"),
      progression: null,
    });
    const { result } = renderHook(() =>
      useResonanceEcho({ sessionKey: "traveler-a" }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(startResonanceEcho).toHaveBeenCalledWith(
      expect.stringMatching(/^resonance-echo:start:/),
    );
    expect(result.current.echo.phase).toBe("waiting");
    expect(result.current.error).toBeNull();
  });

  test("keeps a valid wait visible when polling has a transport error", async () => {
    startResonanceEcho.mockResolvedValue({
      applied: true,
      echo: echo("waiting"),
    });
    pollResonanceEcho.mockResolvedValue({
      error: "Offline",
      echo: { phase: "idle" },
    });
    const { result } = renderHook(() =>
      useResonanceEcho({ sessionKey: "traveler-a" }),
    );
    await act(async () => {
      await result.current.start();
      await result.current.poll();
    });
    expect(result.current.echo.phase).toBe("waiting");
    expect(result.current.error).toBe("Offline");
  });

  test("returns progression only after the completion callable confirms it", async () => {
    const progression = { level: 1, quests: {} };
    completeResonanceEcho.mockResolvedValue({
      applied: true,
      echo: echo("completed", 91_000),
      progression,
    });
    const { result } = renderHook(() =>
      useResonanceEcho({ sessionKey: "traveler-a" }),
    );
    let response;
    await act(async () => {
      response = await result.current.complete();
    });
    expect(response.progression).toBe(progression);
    expect(result.current.echo.phase).toBe("completed");
  });

  test("ignores a late response from a previous account", async () => {
    let resolveStart;
    startResonanceEcho.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ uid }) => useResonanceEcho({ sessionKey: uid }),
      { initialProps: { uid: "traveler-a" } },
    );
    let pending;
    act(() => {
      pending = result.current.start();
    });
    rerender({ uid: "traveler-b" });
    await act(async () => {
      resolveStart({ applied: true, echo: echo("waiting") });
      await pending;
    });
    expect(result.current.echo.phase).toBe("idle");
  });

  test("does not let a callback captured by a prior account start an Echo", async () => {
    const { result, rerender } = renderHook(
      ({ uid }) => useResonanceEcho({ sessionKey: uid }),
      { initialProps: { uid: "traveler-a" } },
    );
    const staleStart = result.current.start;
    rerender({ uid: "traveler-b" });

    let response;
    await act(async () => {
      response = await staleStart();
    });

    expect(response).toEqual({ ignored: true });
    expect(startResonanceEcho).not.toHaveBeenCalled();
  });

  test("recovers its busy state when an unexpected bridge rejection occurs", async () => {
    startResonanceEcho.mockRejectedValue(new Error("unexpected"));
    const { result } = renderHook(() =>
      useResonanceEcho({ sessionKey: "traveler-a" }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe(
      "Resonance Echo is unavailable right now.",
    );
  });
});
