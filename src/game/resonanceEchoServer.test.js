const {
  RESONANCE_ECHO_QUEST_ID,
  RESONANCE_ECHO_ROOM_ID,
  RESONANCE_ECHO_WAIT_MS,
  completeResonanceEcho,
  createResonanceEchoState,
  normalizeResonanceEchoReceipt,
  normalizeResonanceEchoState,
  pollResonanceEcho,
  publicResonanceEchoState,
  startResonanceEcho,
} = require("../../functions/resonanceEcho");

const STARTED_AT = 10_000;
const UID = "echo-player";

function request(actionId, uid = UID) {
  return {
    actionId,
    uid,
    roomId: RESONANCE_ECHO_ROOM_ID,
    questId: RESONANCE_ECHO_QUEST_ID,
  };
}

function pollRequest(uid = UID) {
  const { actionId: ignored, ...binding } = request("unused", uid);
  return binding;
}

function startedState(actionId = "echo:start") {
  const result = startResonanceEcho(
    createResonanceEchoState(),
    request(actionId),
    STARTED_AT,
  );
  expect(result).toEqual(
    expect.objectContaining({ ok: true, applied: true, duplicate: false }),
  );
  return result.state;
}

describe("Resonance Echo server model", () => {
  it("starts a uid/room/quest-bound 90-second wait", () => {
    const result = startResonanceEcho(
      createResonanceEchoState(),
      request("echo:start:1"),
      STARTED_AT,
    );

    expect(result.state).toEqual(
      expect.objectContaining({
        uid: UID,
        roomId: RESONANCE_ECHO_ROOM_ID,
        questId: RESONANCE_ECHO_QUEST_ID,
        startedAt: STARTED_AT,
        maturesAt: STARTED_AT + RESONANCE_ECHO_WAIT_MS,
        completedAt: null,
      }),
    );
    expect(result.state.attemptId).toMatch(
      /^resonance-echo-attempt:[a-f0-9]{64}$/,
    );
    expect(result.state.processedActionIds).toHaveLength(1);
    expect(JSON.stringify(result.state)).not.toContain("echo:start:1");
    expect(result.echo).toEqual(
      expect.objectContaining({
        phase: "waiting",
        remainingMs: RESONANCE_ECHO_WAIT_MS,
        canComplete: false,
      }),
    );
  });

  it("polls without mutating, then reports maturity only from server time", () => {
    const state = startedState();
    const early = pollResonanceEcho(
      state,
      pollRequest(),
      STARTED_AT + RESONANCE_ECHO_WAIT_MS - 1,
    );
    expect(early.ok).toBe(true);
    expect(early.state).toEqual(state);
    expect(early.echo).toEqual(
      expect.objectContaining({ phase: "waiting", remainingMs: 1 }),
    );

    const matureAt = STARTED_AT + RESONANCE_ECHO_WAIT_MS;
    const mature = pollResonanceEcho(state, pollRequest(), matureAt);
    expect(mature.state).toEqual(state);
    expect(mature.echo).toEqual(
      expect.objectContaining({
        phase: "mature",
        remainingMs: 0,
        canComplete: true,
        serverNow: matureAt,
      }),
    );
  });

  it("rejects early completion without consuming its action id, then completes at maturity", () => {
    const state = startedState();
    const input = request("echo:complete:retry-safe");
    const early = completeResonanceEcho(
      state,
      input,
      STARTED_AT + RESONANCE_ECHO_WAIT_MS - 1,
    );
    expect(early).toEqual(
      expect.objectContaining({
        ok: false,
        applied: false,
        duplicate: false,
        code: "echo-wait-active",
        retryAt: STARTED_AT + RESONANCE_ECHO_WAIT_MS,
      }),
    );
    expect(early.state).toEqual(state);

    const completedAt = STARTED_AT + RESONANCE_ECHO_WAIT_MS;
    const completed = completeResonanceEcho(state, input, completedAt);
    expect(completed).toEqual(
      expect.objectContaining({
        ok: true,
        applied: true,
        duplicate: false,
        alreadyCompleted: false,
      }),
    );
    expect(completed.echo.phase).toBe("completed");
    expect(completed.state.completedAt).toBe(completedAt);
    expect(completed.receipt).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(
          /^resonance-echo-receipt:[a-f0-9]{64}$/,
        ),
        uid: UID,
        roomId: RESONANCE_ECHO_ROOM_ID,
        questId: RESONANCE_ECHO_QUEST_ID,
        objectiveId: "resonate-together",
        mode: "echo",
        startedAt: STARTED_AT,
        completedAt,
        verifiedAt: completedAt,
      }),
    );
  });

  it("is idempotent for retried start and completion action ids", () => {
    const firstStart = startResonanceEcho(
      createResonanceEchoState(),
      request("echo:same-start"),
      STARTED_AT,
    );
    const duplicateStart = startResonanceEcho(
      firstStart.state,
      request("echo:same-start"),
      STARTED_AT + 1,
    );
    expect(duplicateStart).toEqual(
      expect.objectContaining({ ok: true, applied: false, duplicate: true }),
    );
    expect(duplicateStart.state).toEqual(firstStart.state);

    const completedAt = STARTED_AT + RESONANCE_ECHO_WAIT_MS;
    const firstComplete = completeResonanceEcho(
      firstStart.state,
      request("echo:same-complete"),
      completedAt,
    );
    const duplicateComplete = completeResonanceEcho(
      firstComplete.state,
      request("echo:same-complete"),
      completedAt + 1,
    );
    expect(duplicateComplete).toEqual(
      expect.objectContaining({
        ok: true,
        applied: false,
        duplicate: true,
        alreadyCompleted: true,
      }),
    );
    expect(duplicateComplete.state).toEqual(firstComplete.state);
    expect(duplicateComplete.receipt).toEqual(firstComplete.receipt);

    const anotherCompletion = completeResonanceEcho(
      firstComplete.state,
      request("echo:new-complete"),
      completedAt + 2,
    );
    expect(anotherCompletion).toEqual(
      expect.objectContaining({
        ok: true,
        applied: false,
        duplicate: false,
        alreadyCompleted: true,
      }),
    );
    expect(anotherCompletion.receipt).toEqual(firstComplete.receipt);
  });

  it("strictly rejects unsafe ids and cross-player, room, or quest use", () => {
    expect(
      startResonanceEcho(
        createResonanceEchoState(),
        request("bad/id"),
        STARTED_AT,
      ).code,
    ).toBe("invalid-action-id");
    expect(
      startResonanceEcho(
        createResonanceEchoState(),
        request("safe", "__proto__"),
        STARTED_AT,
      ).code,
    ).toBe("invalid-uid");
    expect(
      startResonanceEcho(
        createResonanceEchoState(),
        { ...request("safe"), roomId: "another-room" },
        STARTED_AT,
      ).code,
    ).toBe("invalid-room");
    expect(
      startResonanceEcho(
        createResonanceEchoState(),
        { ...request("safe"), questId: "another-quest" },
        STARTED_AT,
      ).code,
    ).toBe("invalid-quest");

    const state = startedState();
    expect(
      pollResonanceEcho(state, pollRequest("another-player"), STARTED_AT + 1)
        .code,
    ).toBe("binding-mismatch");
    expect(
      completeResonanceEcho(
        state,
        request("echo:cross-player", "another-player"),
        STARTED_AT + RESONANCE_ECHO_WAIT_MS,
      ).code,
    ).toBe("binding-mismatch");
  });

  it("normalizes state from trusted timestamps rather than supplied phase fields", () => {
    const state = startedState();
    const processed = state.processedActionIds[0];
    const normalized = normalizeResonanceEchoState(
      {
        ...state,
        phase: "completed",
        maturesAt: STARTED_AT + 1,
        completedAt: STARTED_AT + RESONANCE_ECHO_WAIT_MS - 1,
        processedActionIds: [
          "echo:start",
          processed,
          processed,
          `resonance-echo-action:${"f".repeat(64)}`,
        ],
      },
      STARTED_AT + RESONANCE_ECHO_WAIT_MS,
    );
    expect(normalized.maturesAt).toBe(
      STARTED_AT + RESONANCE_ECHO_WAIT_MS,
    );
    expect(normalized.completedAt).toBeNull();
    expect(normalized.processedActionIds).toEqual([
      processed,
      `resonance-echo-action:${"f".repeat(64)}`,
    ]);
    expect(
      publicResonanceEchoState(
        normalized,
        STARTED_AT + RESONANCE_ECHO_WAIT_MS,
      ).phase,
    ).toBe("mature");

    expect(
      normalizeResonanceEchoState(
        { ...state, attemptId: `resonance-echo-attempt:${"0".repeat(64)}` },
        STARTED_AT + 1,
      ),
    ).toEqual(createResonanceEchoState());
  });

  it("strictly validates deterministic completion receipts", () => {
    const completedAt = STARTED_AT + RESONANCE_ECHO_WAIT_MS;
    const completed = completeResonanceEcho(
      startedState(),
      request("echo:receipt"),
      completedAt,
    );
    expect(
      normalizeResonanceEchoReceipt(completed.receipt, {
        uid: UID,
        roomId: RESONANCE_ECHO_ROOM_ID,
        questId: RESONANCE_ECHO_QUEST_ID,
      }),
    ).toEqual(completed.receipt);
    expect(
      normalizeResonanceEchoReceipt(completed.receipt, {
        uid: "another-player",
      }),
    ).toBeNull();
    expect(
      normalizeResonanceEchoReceipt({
        ...completed.receipt,
        roomId: "another-room",
      }),
    ).toBeNull();
    expect(
      normalizeResonanceEchoReceipt({
        ...completed.receipt,
        completedAt: completed.receipt.startedAt + 1,
      }),
    ).toBeNull();
    expect(
      normalizeResonanceEchoReceipt({
        ...completed.receipt,
        privateProof: "not-accepted",
      }),
    ).toBeNull();
  });
});
