import { httpsCallable } from "firebase/functions";
import {
  RESONANCE_ECHO_QUEST_ID,
  RESONANCE_ECHO_ROOM_ID,
  RESONANCE_ECHO_WAIT_MS,
  completeResonanceEcho,
  createResonanceEchoClientState,
  hydrateResonanceEchoCallableResponse,
  hydrateResonanceEchoState,
  pollResonanceEcho,
  resonanceEchoActionPayload,
  resonanceEchoBindingPayload,
  startResonanceEcho,
} from "./resonanceEcho";

jest.mock("../firebase", () => ({ functions: {} }));
jest.mock("firebase/functions", () => ({ httpsCallable: jest.fn() }));

const STARTED_AT = 10_000;
const MATURES_AT = STARTED_AT + RESONANCE_ECHO_WAIT_MS;
const ATTEMPT_ID = `resonance-echo-attempt:${"a".repeat(64)}`;

function serverEcho(overrides = {}) {
  return {
    version: 1,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
    attemptId: ATTEMPT_ID,
    phase: "waiting",
    startedAt: STARTED_AT,
    maturesAt: MATURES_AT,
    completedAt: null,
    remainingMs: RESONANCE_ECHO_WAIT_MS,
    canComplete: false,
    serverNow: STARTED_AT,
    ...overrides,
  };
}

describe("Resonance Echo client service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("builds only the fixed room/quest binding with a safe action id", () => {
    expect(resonanceEchoBindingPayload()).toEqual({
      roomId: RESONANCE_ECHO_ROOM_ID,
      questId: RESONANCE_ECHO_QUEST_ID,
    });
    expect(resonanceEchoActionPayload("echo:start:1")).toEqual({
      roomId: RESONANCE_ECHO_ROOM_ID,
      questId: RESONANCE_ECHO_QUEST_ID,
      actionId: "echo:start:1",
    });
    expect(resonanceEchoActionPayload("bad/id")).toBeNull();
    expect(resonanceEchoActionPayload(" ")).toBeNull();
  });

  it("derives waiting, mature, and complete phases from coherent server times", () => {
    expect(
      hydrateResonanceEchoState(
        serverEcho({ phase: "completed", serverNow: MATURES_AT - 1 }),
      ),
    ).toEqual(
      expect.objectContaining({
        phase: "waiting",
        remainingMs: 1,
        canComplete: false,
        completedAt: null,
      }),
    );
    expect(
      hydrateResonanceEchoState(
        serverEcho({ phase: "waiting", serverNow: MATURES_AT }),
      ),
    ).toEqual(
      expect.objectContaining({
        phase: "mature",
        remainingMs: 0,
        canComplete: true,
      }),
    );
    expect(
      hydrateResonanceEchoState(
        serverEcho({
          phase: "mature",
          serverNow: MATURES_AT + 10,
          completedAt: MATURES_AT,
        }),
      ),
    ).toEqual(
      expect.objectContaining({
        phase: "completed",
        remainingMs: 0,
        canComplete: false,
        completedAt: MATURES_AT,
      }),
    );
  });

  it("falls back safely for foreign or incoherent response state", () => {
    expect(
      hydrateResonanceEchoState(
        serverEcho({ roomId: "another-room" }),
        50_000,
      ),
    ).toEqual(createResonanceEchoClientState(50_000));
    expect(
      hydrateResonanceEchoState(
        serverEcho({ maturesAt: STARTED_AT + 1 }),
        50_000,
      ).phase,
    ).toBe("idle");
    expect(
      hydrateResonanceEchoState(
        serverEcho({
          completedAt: MATURES_AT - 1,
          serverNow: MATURES_AT,
        }),
      ),
    ).toEqual(
      expect.objectContaining({ phase: "mature", completedAt: null }),
    );
    expect(hydrateResonanceEchoState([serverEcho()], 50_000).phase).toBe(
      "idle",
    );
  });

  it("defensively narrows callable flags, progression, and Echo state", () => {
    const hydrated = hydrateResonanceEchoCallableResponse({
      applied: 1,
      duplicate: true,
      alreadyCompleted: "yes",
      echo: serverEcho({ serverNow: MATURES_AT }),
      progression: { xp: 0 },
      privateState: { processedActionIds: ["secret"] },
    });
    expect(hydrated).toEqual({
      applied: false,
      duplicate: true,
      alreadyCompleted: false,
      echo: expect.objectContaining({ phase: "mature" }),
      progression: { xp: 0 },
    });
    expect(JSON.stringify(hydrated)).not.toContain("processedActionIds");
    expect(
      hydrateResonanceEchoCallableResponse({ progression: [] }).progression,
    ).toBeNull();
  });

  it("calls the bounded start, poll, and complete endpoints", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: {
        applied: true,
        echo: serverEcho({ serverNow: MATURES_AT }),
        progression: { xp: 0 },
      },
    });
    httpsCallable.mockReturnValue(invoke);

    await expect(startResonanceEcho("echo:start:call")).resolves.toEqual(
      expect.objectContaining({
        applied: true,
        echo: expect.objectContaining({ phase: "mature" }),
      }),
    );
    expect(httpsCallable).toHaveBeenLastCalledWith({}, "startResonanceEcho");
    expect(invoke).toHaveBeenLastCalledWith({
      ...resonanceEchoBindingPayload(),
      actionId: "echo:start:call",
    });

    await pollResonanceEcho();
    expect(httpsCallable).toHaveBeenLastCalledWith({}, "pollResonanceEcho");
    expect(invoke).toHaveBeenLastCalledWith(resonanceEchoBindingPayload());

    await completeResonanceEcho("echo:complete:call");
    expect(httpsCallable).toHaveBeenLastCalledWith(
      {},
      "completeResonanceEcho",
    );
    expect(invoke).toHaveBeenLastCalledWith({
      ...resonanceEchoBindingPayload(),
      actionId: "echo:complete:call",
    });
  });

  it("does not call Firebase for an invalid mutating action id", async () => {
    await expect(startResonanceEcho("bad/id", 50_000)).resolves.toEqual(
      expect.objectContaining({
        applied: false,
        progression: null,
        error: "Provide a valid Resonance Echo action identifier.",
      }),
    );
    await expect(completeResonanceEcho("bad/id", 50_000)).resolves.toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it("returns a bounded fallback when a callable rejects", async () => {
    httpsCallable.mockReturnValue(
      jest.fn().mockRejectedValue(new Error("temporary failure")),
    );
    await expect(pollResonanceEcho(50_000)).resolves.toEqual({
      applied: false,
      duplicate: false,
      alreadyCompleted: false,
      echo: createResonanceEchoClientState(50_000),
      progression: null,
      error: "temporary failure",
    });
  });
});
