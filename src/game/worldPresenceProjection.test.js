const {
  WORLD_PRESENCE_ROOMS,
  currentMembershipMatchesEvent,
  membershipEventKind,
  membershipViewReconciliation,
  normalizeRoomMembership,
  pairViewReconciliation,
  presenceProjectionDeletionUpdates,
  presenceViewEntryUpdates,
  reciprocalPresenceDecision,
  safePresenceRoom,
  safePresenceSessionId,
  safePresenceUid,
} = require("../../functions/worldPresenceProjection");

const ROOM = "afterlight-market-garden-v1";
const SESSION_A = "session_a_1234567890abcdef";
const SESSION_A_NEXT = "session_a_fedcba0987654321";
const SESSION_B = "session_b_1234567890abcdef";
const SESSION_C = "session_c_1234567890abcdef";

const membership = (sessionId) => ({ sessionId, joinedAt: 1234 });
const unblocked = {
  complete: true,
  uidBlockedOther: null,
  otherBlockedUid: null,
};

describe("privacy-safe world presence projection", () => {
  it("accepts only bounded RTDB-safe UIDs, room slugs, and session tokens", () => {
    expect(safePresenceUid("traveler-a")).toBe("traveler-a");
    expect(safePresenceUid("bad/user")).toBeNull();
    expect(safePresenceUid("bad.user")).toBeNull();
    expect(safePresenceRoom(ROOM)).toBe(ROOM);
    expect(WORLD_PRESENCE_ROOMS).toEqual([ROOM]);
    expect(safePresenceRoom("another-safe-room")).toBeNull();
    expect(safePresenceRoom("Afterlight Garden")).toBeNull();
    expect(safePresenceRoom(`a${"b".repeat(80)}`)).toBeNull();
    expect(safePresenceSessionId(SESSION_A)).toBe(SESSION_A);
    expect(safePresenceSessionId("short-session")).toBeNull();
    expect(normalizeRoomMembership(membership(SESSION_A))).toEqual({
      sessionId: SESSION_A,
    });
    expect(normalizeRoomMembership({ sessionId: "bad/session-token" })).toBeNull();
  });

  it("requires two completed directional block reads before granting", () => {
    expect(reciprocalPresenceDecision(unblocked)).toEqual({
      allowed: true,
      reason: "unblocked",
    });
    expect(
      reciprocalPresenceDecision({
        complete: true,
        uidBlockedOther: true,
        otherBlockedUid: null,
      }),
    ).toEqual({ allowed: false, reason: "blocked" });
    expect(
      reciprocalPresenceDecision({
        complete: false,
        uidBlockedOther: null,
        otherBlockedUid: true,
      }),
    ).toEqual({ allowed: false, reason: "blocked" });
    expect(
      reciprocalPresenceDecision({
        complete: true,
        uidBlockedOther: null,
      }),
    ).toEqual({ allowed: false, reason: "unknown" });
    expect(reciprocalPresenceDecision()).toEqual({
      allowed: false,
      reason: "unknown",
    });
  });

  it("classifies membership changes and compares their current session", () => {
    expect(membershipEventKind(null, membership(SESSION_A))).toBe("join");
    expect(membershipEventKind(membership(SESSION_A), null)).toBe("leave");
    expect(
      membershipEventKind(
        membership(SESSION_A),
        membership(SESSION_A_NEXT),
      ),
    ).toBe("rotate");
    expect(
      membershipEventKind(membership(SESSION_A), membership(SESSION_A)),
    ).toBe("refresh");
    expect(
      currentMembershipMatchesEvent(
        membership(SESSION_A),
        membership(SESSION_A),
      ),
    ).toBe(true);
    expect(
      currentMembershipMatchesEvent(
        membership(SESSION_A),
        membership(SESSION_A_NEXT),
      ),
    ).toBe(false);
    expect(currentMembershipMatchesEvent(null, null)).toBe(true);
  });

  it("fans a current join out symmetrically and revokes unknown or stale peers", () => {
    const plan = membershipViewReconciliation({
      room: ROOM,
      uid: "traveler-a",
      beforeMembership: null,
      afterMembership: membership(SESSION_A),
      membershipStateLoaded: true,
      memberships: {
        "traveler-a": membership(SESSION_A),
        "traveler-b": membership(SESSION_B),
        "traveler-c": membership(SESSION_C),
      },
      viewerRoster: {
        "traveler-ghost": "stale_session_1234567890",
      },
      blockStates: {
        "traveler-b": unblocked,
      },
    });

    expect(plan).toEqual({
      status: "reconciled",
      event: "join",
      incompleteBlockUids: ["traveler-c"],
      updates: {
        [`worldPresenceViews/traveler-a/${ROOM}/traveler-b`]: SESSION_B,
        [`worldPresenceViews/traveler-b/${ROOM}/traveler-a`]: SESSION_A,
        [`worldPresenceViews/traveler-a/${ROOM}/traveler-c`]: null,
        [`worldPresenceViews/traveler-c/${ROOM}/traveler-a`]: null,
        [`worldPresenceViews/traveler-a/${ROOM}/traveler-ghost`]: null,
        [`worldPresenceViews/traveler-ghost/${ROOM}/traveler-a`]: null,
      },
    });
  });

  it("removes both halves of every known pair on a current leave", () => {
    const plan = membershipViewReconciliation({
      room: ROOM,
      uid: "traveler-a",
      beforeMembership: membership(SESSION_A),
      afterMembership: null,
      membershipStateLoaded: true,
      memberships: {
        "traveler-b": membership(SESSION_B),
        "traveler-c": membership(SESSION_C),
      },
      viewerRoster: {
        "traveler-b": SESSION_B,
        "traveler-ghost": "stale_session_1234567890",
      },
    });

    expect(plan.status).toBe("reconciled");
    expect(plan.event).toBe("leave");
    expect(plan.incompleteBlockUids).toEqual([]);
    expect(plan.updates).toEqual({
      [`worldPresenceViews/traveler-a/${ROOM}/traveler-b`]: null,
      [`worldPresenceViews/traveler-b/${ROOM}/traveler-a`]: null,
      [`worldPresenceViews/traveler-a/${ROOM}/traveler-c`]: null,
      [`worldPresenceViews/traveler-c/${ROOM}/traveler-a`]: null,
      [`worldPresenceViews/traveler-a/${ROOM}/traveler-ghost`]: null,
      [`worldPresenceViews/traveler-ghost/${ROOM}/traveler-a`]: null,
    });
  });

  it("rotates the session token exposed to peers", () => {
    const plan = membershipViewReconciliation({
      room: ROOM,
      uid: "traveler-a",
      beforeMembership: membership(SESSION_A),
      afterMembership: membership(SESSION_A_NEXT),
      membershipStateLoaded: true,
      memberships: {
        "traveler-a": membership(SESSION_A_NEXT),
        "traveler-b": membership(SESSION_B),
      },
      blockStates: { "traveler-b": unblocked },
    });

    expect(plan.event).toBe("rotate");
    expect(plan.updates).toEqual({
      [`worldPresenceViews/traveler-a/${ROOM}/traveler-b`]: SESSION_B,
      [`worldPresenceViews/traveler-b/${ROOM}/traveler-a`]: SESSION_A_NEXT,
    });
  });

  it("ignores delayed join or leave events that observe a newer session", () => {
    expect(
      membershipViewReconciliation({
        room: ROOM,
        uid: "traveler-a",
        beforeMembership: null,
        afterMembership: membership(SESSION_A),
        membershipStateLoaded: true,
        memberships: {
          "traveler-a": membership(SESSION_A_NEXT),
          "traveler-b": membership(SESSION_B),
        },
      }),
    ).toMatchObject({ status: "stale-event", updates: {} });

    expect(
      membershipViewReconciliation({
        room: ROOM,
        uid: "traveler-a",
        beforeMembership: membership(SESSION_A),
        afterMembership: null,
        membershipStateLoaded: true,
        memberships: {
          "traveler-a": membership(SESSION_A_NEXT),
          "traveler-b": membership(SESSION_B),
        },
      }),
    ).toMatchObject({ status: "stale-event", updates: {} });
  });

  it("does not invent updates when the room snapshot or path is unsafe", () => {
    expect(
      membershipViewReconciliation({
        room: ROOM,
        uid: "traveler-a",
        afterMembership: membership(SESSION_A),
      }),
    ).toMatchObject({ status: "state-unavailable", updates: {} });
    expect(
      membershipViewReconciliation({
        room: "bad/room",
        uid: "traveler-a",
        membershipStateLoaded: true,
      }),
    ).toMatchObject({ status: "invalid", updates: {} });
    expect(
      presenceViewEntryUpdates(
        ROOM,
        "bad/user",
        SESSION_A,
        "traveler-b",
        SESSION_B,
        true,
      ),
    ).toEqual({});
  });

  it("reconciles block and unblock changes from current membership sessions", () => {
    const memberships = {
      "traveler-a": membership(SESSION_A),
      "traveler-b": membership(SESSION_B),
    };
    expect(
      pairViewReconciliation({
        room: ROOM,
        uid: "traveler-a",
        otherUid: "traveler-b",
        memberships,
        membershipStateLoaded: true,
        blockState: unblocked,
      }),
    ).toEqual({
      status: "visible",
      updates: {
        [`worldPresenceViews/traveler-a/${ROOM}/traveler-b`]: SESSION_B,
        [`worldPresenceViews/traveler-b/${ROOM}/traveler-a`]: SESSION_A,
      },
    });

    expect(
      pairViewReconciliation({
        room: ROOM,
        uid: "traveler-a",
        otherUid: "traveler-b",
        blockState: {
          complete: false,
          uidBlockedOther: true,
        },
      }),
    ).toEqual({
      status: "blocked",
      updates: {
        [`worldPresenceViews/traveler-a/${ROOM}/traveler-b`]: null,
        [`worldPresenceViews/traveler-b/${ROOM}/traveler-a`]: null,
      },
    });
  });

  it("revokes unknown pairs, and never grants an unblock without membership state", () => {
    expect(
      pairViewReconciliation({
        room: ROOM,
        uid: "traveler-a",
        otherUid: "traveler-b",
      }),
    ).toEqual({
      status: "state-unavailable",
      updates: {
        [`worldPresenceViews/traveler-a/${ROOM}/traveler-b`]: null,
        [`worldPresenceViews/traveler-b/${ROOM}/traveler-a`]: null,
      },
    });

    expect(
      pairViewReconciliation({
        room: ROOM,
        uid: "traveler-a",
        otherUid: "traveler-b",
        memberships: {
          "traveler-a": membership(SESSION_A),
          "traveler-b": membership(SESSION_B),
        },
        blockState: unblocked,
      }),
    ).toEqual({ status: "state-unavailable", updates: {} });

    expect(
      pairViewReconciliation({
        room: ROOM,
        uid: "traveler-a",
        otherUid: "traveler-b",
        memberships: { "traveler-a": membership(SESSION_A) },
        membershipStateLoaded: true,
        blockState: unblocked,
      }),
    ).toEqual({
      status: "not-co-located",
      updates: {
        [`worldPresenceViews/traveler-a/${ROOM}/traveler-b`]: null,
        [`worldPresenceViews/traveler-b/${ROOM}/traveler-a`]: null,
      },
    });
  });

  it("removes owned memberships, owned views, and inbound account references", () => {
    expect(
      presenceProjectionDeletionUpdates(
        {
          worldRoomMemberships: {
            [ROOM]: {
              "traveler-a": membership(SESSION_A),
              "traveler-b": membership(SESSION_B),
            },
            "not-an-allowed-room": {
              "traveler-a": membership(SESSION_A),
            },
          },
          worldRoomDisconnects: {
            [ROOM]: {
              "traveler-a": { [SESSION_A]: true },
            },
          },
          worldPresenceViews: {
            "traveler-a": {
              [ROOM]: { "traveler-b": SESSION_B },
            },
            "traveler-b": {
              [ROOM]: { "traveler-a": SESSION_A },
            },
            "traveler-c": {
              [ROOM]: { "traveler-b": SESSION_B },
            },
          },
        },
        "traveler-a",
      ),
    ).toEqual({
      "worldPresenceViews/traveler-a": null,
      [`worldRoomMemberships/${ROOM}/traveler-a`]: null,
      [`worldRoomDisconnects/${ROOM}/traveler-a`]: null,
      [`worldPresenceViews/traveler-b/${ROOM}/traveler-a`]: null,
    });
  });
});
