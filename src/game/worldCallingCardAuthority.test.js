const {
  CALLING_CARD_PRESENCE_FRESH_MS,
  WORLD_CALLING_CARD_ROOM,
  callingCardPresenceIsAuthorized,
  safeCallingCardRoom,
} = require("../../functions/worldCallingCard");

const ROOM = WORLD_CALLING_CARD_ROOM;
const ALICE_SESSION = "alice_session_1234567890";
const BOB_SESSION = "bob_session_123456789012";

function rootAt(now) {
  return {
    worldRoomMemberships: {
      [ROOM]: {
        alice: { sessionId: ALICE_SESSION },
        bob: { sessionId: BOB_SESSION },
      },
    },
    presence: {
      [ROOM]: {
        alice: { sessionId: ALICE_SESSION, lastUpdate: now },
        bob: { sessionId: BOB_SESSION, lastUpdate: now },
      },
    },
    worldPresenceViews: {
      alice: { [ROOM]: { bob: BOB_SESSION } },
      bob: { [ROOM]: { alice: ALICE_SESSION } },
    },
  };
}

describe("world calling-card co-presence authority", () => {
  test("accepts only the deployed room", () => {
    expect(safeCallingCardRoom(ROOM)).toBe(ROOM);
    expect(safeCallingCardRoom("another-room")).toBeNull();
  });

  test("requires fresh reciprocal projected co-presence", () => {
    const now = 1_900_000_000_000;
    expect(
      callingCardPresenceIsAuthorized(rootAt(now), {
        callerUid: "alice",
        targetUid: "bob",
        room: ROOM,
        now,
      }),
    ).toBe(true);

    const stale = rootAt(now);
    stale.presence[ROOM].alice.lastUpdate =
      now - CALLING_CARD_PRESENCE_FRESH_MS - 1;
    expect(
      callingCardPresenceIsAuthorized(stale, {
        callerUid: "alice",
        targetUid: "bob",
        room: ROOM,
        now,
      }),
    ).toBe(false);

    const oneWay = rootAt(now);
    delete oneWay.worldPresenceViews.bob[ROOM].alice;
    expect(
      callingCardPresenceIsAuthorized(oneWay, {
        callerUid: "alice",
        targetUid: "bob",
        room: ROOM,
        now,
      }),
    ).toBe(false);
  });

  test("fails closed for session rotation, blocks, or deletion", () => {
    const now = 1_900_000_000_000;
    for (const mutate of [
      (root) => {
        root.worldRoomMemberships[ROOM].bob.sessionId =
          "rotated_session_123456789";
      },
      (root) => {
        root.worldBlockEdges = { alice: { bob: true } };
      },
      (root) => {
        root.worldBlockEdges = { bob: { alice: true } };
      },
      (root) => {
        root.worldAccountDeletionTombstones = { bob: true };
      },
    ]) {
      const root = rootAt(now);
      mutate(root);
      expect(
        callingCardPresenceIsAuthorized(root, {
          callerUid: "alice",
          targetUid: "bob",
          room: ROOM,
          now,
        }),
      ).toBe(false);
    }
  });
});
