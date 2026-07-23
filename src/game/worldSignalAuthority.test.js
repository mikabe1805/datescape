const {
  WORLD_SIGNAL_COOLDOWNS_MS,
  WORLD_SIGNAL_INVITE_FRESH_MS,
  WORLD_SIGNAL_PRESENCE_FRESH_MS,
  WORLD_SIGNAL_ROOM_ID,
  WORLD_SIGNAL_TYPES,
  normalizeWorldSignalRequest,
  planWorldSignal,
  reciprocalWorldSignalPresenceDecision,
  releaseWorldSignalReservation,
  reserveWorldSignalRate,
  safeWorldSignalActionId,
  safeWorldSignalSessionId,
  safeWorldSignalUid,
  trustedWorldSignalDisplay,
  validPendingWorldSignalInvite,
  worldSignalRateDecision,
  worldSignalRateLimitDeletionUpdates,
} = require("../../functions/worldSignal");

const NOW = 1_000_000;
const FROM_SESSION = "from_session_1234567890abcdef";
const TO_SESSION = "recipient_session_1234567890";
const INVITE_ACTION_ID = "signal:invite:0000000001";

function request(type = "wave", overrides = {}) {
  return {
    room: WORLD_SIGNAL_ROOM_ID,
    toUid: "traveler-b",
    type,
    actionId: `signal:${type}:0000000001`,
    ...(type.startsWith("invite-chess-")
      ? { replyToActionId: INVITE_ACTION_ID }
      : {}),
    ...overrides,
  };
}

function action(type = "wave", overrides = {}) {
  const normalized = normalizeWorldSignalRequest(
    request(type, overrides),
    "traveler-a",
  );
  if (!normalized.ok) throw new Error("test action was invalid");
  return normalized.action;
}

function authority(overrides = {}) {
  return {
    complete: true,
    fromPresence: {
      sessionId: FROM_SESSION,
      lastUpdate: NOW,
      name: "Presence Ari",
      color: "#75D8D0",
    },
    fromMembership: { sessionId: FROM_SESSION, joinedAt: NOW - 1_000 },
    toPresence: {
      sessionId: TO_SESSION,
      lastUpdate: NOW,
      name: "Briar",
      color: "#f5c973",
    },
    toMembership: { sessionId: TO_SESSION, joinedAt: NOW - 500 },
    fromViewSession: TO_SESSION,
    toViewSession: FROM_SESSION,
    blockState: {
      complete: true,
      fromBlockedTo: null,
      toBlockedFrom: null,
    },
    deletionState: {
      complete: true,
      fromDeleted: null,
      toDeleted: null,
    },
    fromProfile: { displayName: "Profile Ari" },
    ...overrides,
  };
}

function pendingInvite(overrides = {}) {
  return {
    room: WORLD_SIGNAL_ROOM_ID,
    type: "invite-chess",
    fromUid: "traveler-b",
    fromName: "Briar",
    fromColor: "#f5c973",
    actionId: INVITE_ACTION_ID,
    at: NOW - 1_000,
    ...overrides,
  };
}

function plan(type = "wave", overrides = {}) {
  return planWorldSignal({
    action: action(type, overrides.action),
    authorityState: authority(overrides.authority),
    rateState: overrides.rateState || { loaded: true, value: null },
    pendingInviteState:
      overrides.pendingInviteState || {
        loaded: true,
        value: pendingInvite(),
      },
    now: overrides.now || NOW,
  });
}

describe("server-authoritative Afterlight signals", () => {
  test("accepts only the authored room, safe identities, and four supported signal types", () => {
    expect(WORLD_SIGNAL_TYPES).toEqual([
      "wave",
      "invite-chess",
      "invite-chess-accepted",
      "invite-chess-declined",
    ]);
    expect(WORLD_SIGNAL_TYPES).not.toContain("like-mutual");
    expect(normalizeWorldSignalRequest(request(), "traveler-a")).toMatchObject({
      ok: true,
      action: { fromUid: "traveler-a", toUid: "traveler-b", type: "wave" },
    });
    expect(
      normalizeWorldSignalRequest(
        request("invite-chess-accepted"),
        "traveler-a",
      ).ok,
    ).toBe(true);
    expect(
      normalizeWorldSignalRequest(request("like-mutual"), "traveler-a").ok,
    ).toBe(false);
    expect(
      normalizeWorldSignalRequest(
        request("wave", { room: "somewhere-else" }),
        "traveler-a",
      ).ok,
    ).toBe(false);
    expect(
      normalizeWorldSignalRequest(request("wave"), "traveler/a").ok,
    ).toBe(false);
    expect(
      normalizeWorldSignalRequest(
        request("wave", { toUid: "traveler-a" }),
        "traveler-a",
      ).ok,
    ).toBe(false);
    expect(safeWorldSignalUid("bad.user")).toBeNull();
    expect(safeWorldSignalSessionId("too-short")).toBeNull();
    expect(safeWorldSignalActionId("too-short")).toBeNull();
  });

  test("rejects client-authored identity/display fields and malformed reply schemas", () => {
    expect(
      normalizeWorldSignalRequest(
        request("wave", { fromUid: "traveler-c" }),
        "traveler-a",
      ).ok,
    ).toBe(false);
    expect(
      normalizeWorldSignalRequest(
        request("wave", { fromName: "Administrator", fromColor: "#000000" }),
        "traveler-a",
      ).ok,
    ).toBe(false);
    expect(
      normalizeWorldSignalRequest(
        request("wave", { replyToActionId: INVITE_ACTION_ID }),
        "traveler-a",
      ).ok,
    ).toBe(false);
    expect(
      normalizeWorldSignalRequest(
        request("invite-chess-accepted", { replyToActionId: undefined }),
        "traveler-a",
      ).ok,
    ).toBe(false);
  });

  test("derives a bounded sender display only from server-loaded presence/profile state", () => {
    expect(
      trustedWorldSignalDisplay({
        presence: { name: "Presence name", color: "#75D8D0" },
        profile: { displayName: "  Profile   Ari  " },
      }),
    ).toEqual({ fromName: "Profile Ari", fromColor: "#75d8d0" });
    expect(
      trustedWorldSignalDisplay({
        presence: { name: "Wayfarer", color: "not-a-color" },
      }),
    ).toEqual({ fromName: "Wayfarer", fromColor: "#f5c973" });
    expect(trustedWorldSignalDisplay({ presence: {} })).toBeNull();
  });

  test("requires fresh session-bound presence projected in both directions", () => {
    expect(reciprocalWorldSignalPresenceDecision(authority(), NOW)).toMatchObject({
      allowed: true,
      fromSessionId: FROM_SESSION,
      toSessionId: TO_SESSION,
    });
    expect(
      reciprocalWorldSignalPresenceDecision(
        authority({ fromViewSession: "wrong_session_1234567890" }),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "not-co-present" });
    expect(
      reciprocalWorldSignalPresenceDecision(
        authority({
          fromPresence: {
            ...authority().fromPresence,
            lastUpdate: NOW - WORLD_SIGNAL_PRESENCE_FRESH_MS - 1,
          },
        }),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "not-co-present" });
    expect(
      reciprocalWorldSignalPresenceDecision(
        authority({ fromMembership: { sessionId: TO_SESSION } }),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "not-co-present" });
  });

  test("fails closed on incomplete, blocked, or deleted pair authority", () => {
    expect(
      reciprocalWorldSignalPresenceDecision(authority({ complete: false }), NOW),
    ).toEqual({ allowed: false, reason: "state-unavailable" });
    expect(
      reciprocalWorldSignalPresenceDecision(
        authority({
          blockState: {
            complete: true,
            fromBlockedTo: true,
            toBlockedFrom: null,
          },
        }),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "pair-unavailable" });
    expect(
      reciprocalWorldSignalPresenceDecision(
        authority({
          blockState: {
            complete: true,
            fromBlockedTo: null,
            toBlockedFrom: true,
          },
        }),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "pair-unavailable" });
    expect(
      reciprocalWorldSignalPresenceDecision(
        authority({
          deletionState: {
            complete: true,
            fromDeleted: null,
            toDeleted: true,
          },
        }),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "account-unavailable" });
    expect(
      reciprocalWorldSignalPresenceDecision(
        authority({
          deletionState: { complete: true, fromDeleted: null },
        }),
        NOW,
      ),
    ).toEqual({ allowed: false, reason: "state-unavailable" });
  });

  test("writes a constant-size server-derived inbox event and pair rate record", () => {
    const result = plan();
    expect(result).toMatchObject({
      ok: true,
      applied: true,
      duplicate: false,
      signal: {
        room: WORLD_SIGNAL_ROOM_ID,
        type: "wave",
        fromUid: "traveler-a",
        fromName: "Profile Ari",
        fromColor: "#75d8d0",
        at: NOW,
      },
      rate: {
        type: "wave",
        at: NOW,
      },
    });
    expect(Object.keys(result.updates)).toEqual([
      "signals/traveler-b/traveler-a",
      "worldSignalRateLimits/traveler-a/traveler-b",
    ]);
    expect(result.updates["signals/traveler-b/traveler-a"]).not.toHaveProperty(
      "toUid",
    );
    expect(
      planWorldSignal({
        action: { ...action("wave"), fromName: "Forged name" },
        authorityState: authority(),
        rateState: { loaded: true, value: null },
        now: NOW,
      }),
    ).toEqual({ ok: false, code: "invalid-argument", updates: {} });
  });

  test("accepts or declines only a fresh reciprocal invite and consumes it atomically", () => {
    for (const type of ["invite-chess-accepted", "invite-chess-declined"]) {
      const result = plan(type);
      expect(result).toMatchObject({
        ok: true,
        applied: true,
        signal: {
          type,
          fromUid: "traveler-a",
          replyToActionId: INVITE_ACTION_ID,
        },
      });
      expect(result.updates["signals/traveler-a/traveler-b"]).toBeNull();
      expect(result.updates["signals/traveler-b/traveler-a"]).toEqual(
        result.signal,
      );
    }
    expect(
      validPendingWorldSignalInvite(
        pendingInvite(),
        {
          inviterUid: "traveler-b",
          inviteeUid: "traveler-a",
          replyToActionId: INVITE_ACTION_ID,
          room: WORLD_SIGNAL_ROOM_ID,
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("rejects missing, stale, wrong-pair, or wrong-action invite responses", () => {
    const cases = [
      { loaded: false, value: pendingInvite() },
      { loaded: true, value: null },
      {
        loaded: true,
        value: pendingInvite({ at: NOW - WORLD_SIGNAL_INVITE_FRESH_MS - 1 }),
      },
      { loaded: true, value: pendingInvite({ fromUid: "traveler-c" }) },
      {
        loaded: true,
        value: pendingInvite({ actionId: "signal:invite:0000000099" }),
      },
      { loaded: true, value: pendingInvite({ type: "wave" }) },
    ];
    cases.forEach((pendingInviteState) => {
      expect(
        plan("invite-chess-accepted", { pendingInviteState }),
      ).toMatchObject({
        ok: false,
        code: "failed-precondition",
        reason: "invite-unavailable",
        updates: {},
      });
    });
  });

  test("applies a bounded pair cooldown and reports the exact retry delay", () => {
    const existing = {
      actionId: "signal:wave:0000000000",
      type: "wave",
      at: NOW - 1_000,
      delivered: true,
    };
    expect(
      worldSignalRateDecision(
        { loaded: true, value: existing },
        action("wave"),
        NOW,
      ),
    ).toEqual({
      allowed: false,
      code: "cooldown",
      retryAfterMs: WORLD_SIGNAL_COOLDOWNS_MS.wave - 1_000,
    });
    expect(
      plan("wave", { rateState: { loaded: true, value: existing } }),
    ).toMatchObject({
      ok: false,
      code: "resource-exhausted",
      reason: "cooldown",
      retryAfterMs: 2_000,
      updates: {},
    });
  });

  test("replays an exact action idempotently but rejects action-id reuse", () => {
    const acceptedAction = action("invite-chess-accepted");
    const acceptedRate = {
      actionId: acceptedAction.actionId,
      type: acceptedAction.type,
      replyToActionId: acceptedAction.replyToActionId,
      at: NOW - 1_000,
      delivered: true,
    };
    expect(
      plan("invite-chess-accepted", {
        rateState: { loaded: true, value: acceptedRate },
        pendingInviteState: { loaded: true, value: null },
      }),
    ).toEqual({ ok: true, applied: false, duplicate: true, updates: {} });

    const conflictingAction = action("invite-chess-declined", {
      actionId: acceptedAction.actionId,
    });
    expect(
      planWorldSignal({
        action: conflictingAction,
        authorityState: authority(),
        rateState: { loaded: true, value: acceptedRate },
        pendingInviteState: { loaded: true, value: pendingInvite() },
        now: NOW,
      }),
    ).toMatchObject({
      ok: false,
      code: "aborted",
      reason: "action-conflict",
      updates: {},
    });
  });

  test("does not let idempotent retries bypass a new block or deletion", () => {
    const waveAction = action("wave");
    const duplicateRate = {
      actionId: waveAction.actionId,
      type: waveAction.type,
      at: NOW - 500,
      delivered: true,
    };
    expect(
      plan("wave", {
        authority: {
          blockState: {
            complete: true,
            fromBlockedTo: null,
            toBlockedFrom: true,
          },
        },
        rateState: { loaded: true, value: duplicateRate },
      }),
    ).toMatchObject({ ok: false, reason: "pair-unavailable", updates: {} });
    expect(
      plan("wave", {
        authority: {
          deletionState: {
            complete: true,
            fromDeleted: true,
            toDeleted: null,
          },
        },
        rateState: { loaded: true, value: duplicateRate },
      }),
    ).toMatchObject({ ok: false, reason: "account-unavailable", updates: {} });
  });

  test("fails closed when rate state is missing, malformed, or future-dated", () => {
    expect(plan("wave", { rateState: { loaded: false, value: null } })).toMatchObject(
      { ok: false, reason: "state-unavailable", updates: {} },
    );
    expect(
      plan("wave", {
        rateState: {
          loaded: true,
          value: { actionId: "bad", type: "wave", at: NOW },
        },
      }),
    ).toMatchObject({ ok: false, reason: "state-unavailable", updates: {} });
    expect(
      plan("wave", {
        rateState: {
          loaded: true,
          value: {
            actionId: "signal:wave:0000000000",
            type: "wave",
            at: NOW + 5_001,
            delivered: true,
          },
        },
      }),
    ).toMatchObject({ ok: false, reason: "state-unavailable", updates: {} });
  });

  test("reserves one fixed pair slot and can resume or release an interrupted delivery", () => {
    const waveAction = action("wave");
    const first = reserveWorldSignalRate(
      { loaded: true, value: null },
      waveAction,
      NOW,
    );
    expect(first).toEqual({
      ok: true,
      applied: true,
      duplicate: false,
      resume: false,
      reservation: {
        actionId: waveAction.actionId,
        type: "wave",
        at: NOW,
        delivered: false,
      },
    });
    expect(
      reserveWorldSignalRate(
        { loaded: true, value: first.reservation },
        waveAction,
        NOW + 100,
      ),
    ).toMatchObject({
      ok: true,
      applied: false,
      duplicate: false,
      resume: true,
      reservation: first.reservation,
    });

    const resumed = planWorldSignal({
      action: waveAction,
      authorityState: authority(),
      rateState: { loaded: true, value: first.reservation },
      now: NOW + 100,
    });
    expect(resumed).toMatchObject({
      ok: true,
      applied: true,
      signal: { at: NOW },
      rate: { at: NOW, delivered: true },
    });
    expect(
      releaseWorldSignalReservation(first.reservation, waveAction, NOW + 100),
    ).toBeNull();
    expect(
      releaseWorldSignalReservation(
        { ...first.reservation, delivered: true },
        waveAction,
        NOW + 100,
      ),
    ).toBeUndefined();
  });

  test("purges owned and inbound fixed-slot rate state on account deletion", () => {
    expect(
      worldSignalRateLimitDeletionUpdates(
        {
          "traveler-a": { "traveler-b": { delivered: true } },
          "traveler-b": { "traveler-a": { delivered: true } },
          "traveler-c": { "traveler-a": { delivered: true } },
          "traveler-d": { "traveler-z": { delivered: true } },
          "bad/user": { "traveler-a": { delivered: true } },
        },
        "traveler-a",
      ),
    ).toEqual({
      "worldSignalRateLimits/traveler-a": null,
      "worldSignalRateLimits/traveler-b/traveler-a": null,
      "worldSignalRateLimits/traveler-c/traveler-a": null,
    });
    expect(worldSignalRateLimitDeletionUpdates({}, "bad/user")).toEqual({});
  });
});
