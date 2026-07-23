const {
  DISCOVERY_REFRESH_COOLDOWN_MS,
  DISCOVERY_REFRESH_WINDOW_MAX,
  DISCOVERY_REFRESH_WINDOW_MS,
  closeIneligibleDiscoveryMatch,
  discoveryProfileFingerprint,
  reconcileDiscoveryMatch,
  reserveDiscoveryRefresh,
} = require("../../functions/discoveryRefresh");

const userA = {
  uid: "traveler-a",
  displayName: "Ari",
  age: 29,
  gender: "Woman",
  lookingFor: "Dating",
  media: ["https://example.test/a.jpg"],
};
const userB = {
  ...userA,
  uid: "traveler-b",
  displayName: "Bo",
  gender: "Man",
  media: ["https://example.test/b.jpg"],
};

function transactionHarness(snapshotValue, snapshotsById = {}) {
  const writes = [];
  const transaction = {
    get: jest.fn(async (ref) => {
      const value = Object.prototype.hasOwnProperty.call(snapshotsById, ref.id)
        ? snapshotsById[ref.id]
        : snapshotValue;
      return {
        exists: value !== null,
        data: () => value,
      };
    }),
    set: jest.fn((_ref, data, options) => {
      writes.push({ data, options });
    }),
  };
  return {
    firestore: {
      runTransaction: (callback) => callback(transaction),
    },
    writes,
  };
}

function refreshStateHarness(initialState = null) {
  let state = initialState;
  const writes = [];
  const transaction = {
    get: jest.fn(async () => ({
      exists: state !== null,
      data: () => state,
    })),
    set: jest.fn((_ref, data) => {
      state = data;
      writes.push(data);
    }),
  };
  return {
    firestore: {
      runTransaction: (callback) => callback(transaction),
    },
    getState: () => state,
    writes,
  };
}

describe("concurrency-safe discovery reconciliation", () => {
  it("never includes mutable participant decisions when refreshing an existing match", async () => {
    const harness = transactionHarness({
      userA: userA.uid,
      userB: userB.uid,
      likedByA: true,
      likedByB: false,
      matched: false,
      isActiveA: false,
      isActiveB: true,
      source: "discovery",
    });

    await expect(
      reconcileDiscoveryMatch(
        harness.firestore,
        { id: "match" },
        userA,
        userB,
        () => "server-time",
      ),
    ).resolves.toEqual({ status: "updated" });

    expect(harness.writes).toHaveLength(1);
    expect(harness.writes[0].options).toEqual({ merge: true });
    expect(harness.writes[0].data).not.toHaveProperty("likedByA");
    expect(harness.writes[0].data).not.toHaveProperty("likedByB");
    expect(harness.writes[0].data).not.toHaveProperty("matched");
    expect(harness.writes[0].data).not.toHaveProperty("isActiveA");
    expect(harness.writes[0].data).not.toHaveProperty("isActiveB");
  });

  it("initializes decisions only when the transaction still observes no document", async () => {
    const first = transactionHarness(null);
    await reconcileDiscoveryMatch(
      first.firestore,
      { id: "match" },
      userA,
      userB,
      () => "server-time",
    );
    expect(first.writes[0].data).toEqual(
      expect.objectContaining({
        likedByA: false,
        likedByB: false,
        matched: false,
        isActiveA: true,
        isActiveB: true,
      }),
    );
    expect(first.writes[0].options).toBeUndefined();

    // A retry/second first-refresh sees the winner's document and therefore
    // updates authority only, preserving any decision made in between.
    const retry = transactionHarness({
      ...first.writes[0].data,
      likedByA: true,
      isActiveA: false,
    });
    await reconcileDiscoveryMatch(
      retry.firestore,
      { id: "match" },
      userA,
      userB,
      () => "later-server-time",
    );
    expect(retry.writes[0].data).not.toHaveProperty("likedByA");
    expect(retry.writes[0].data).not.toHaveProperty("isActiveA");
  });

  it("closes an ineligible card by touching active flags only", async () => {
    const harness = transactionHarness({
      userA: userA.uid,
      userB: userB.uid,
      likedByA: true,
      likedByB: false,
      matched: false,
      isActiveA: false,
      isActiveB: true,
      source: "discovery",
    });
    await expect(
      closeIneligibleDiscoveryMatch(harness.firestore, { id: "match" }),
    ).resolves.toEqual({ status: "closed" });
    expect(harness.writes).toEqual([
      {
        data: { isActiveA: false, isActiveB: false },
        options: { merge: true },
      },
    ]);
  });

  it("retains a stale close target when both current profiles are now eligible", async () => {
    const match = {
      userA: userA.uid,
      userB: userB.uid,
      matched: false,
      isActiveA: true,
      isActiveB: true,
      source: "discovery",
    };
    const harness = transactionHarness(match, {
      "refresh-state": { refreshAttemptId: "current-attempt" },
      [userA.uid]: userA,
      [userB.uid]: userB,
    });

    await expect(
      closeIneligibleDiscoveryMatch(harness.firestore, { id: "match" }, {
        refreshStateRef: { id: "refresh-state" },
        refreshAttemptId: "current-attempt",
        participantUserRefs: [
          { uid: userA.uid, ref: { id: userA.uid } },
          { uid: userB.uid, ref: { id: userB.uid } },
        ],
      }),
    ).resolves.toEqual({ status: "retained" });
    expect(harness.writes).toHaveLength(0);
  });

  it.each([
    ["blocked", { ...userB, blockedUsers: [userA.uid] }],
    ["ineligible", { ...userB, media: [] }],
  ])("still closes a currently %s pair", async (_label, currentUserB) => {
    const match = {
      userA: userA.uid,
      userB: userB.uid,
      matched: false,
      isActiveA: true,
      isActiveB: true,
      source: "discovery",
    };
    const harness = transactionHarness(match, {
      "refresh-state": { refreshAttemptId: "current-attempt" },
      [userA.uid]: userA,
      [userB.uid]: currentUserB,
    });

    await expect(
      closeIneligibleDiscoveryMatch(harness.firestore, { id: "match" }, {
        refreshStateRef: { id: "refresh-state" },
        refreshAttemptId: "current-attempt",
        participantUserRefs: [
          { uid: userA.uid, ref: { id: userA.uid } },
          { uid: userB.uid, ref: { id: userB.uid } },
        ],
      }),
    ).resolves.toEqual({ status: "closed" });
    expect(harness.writes).toEqual([
      {
        data: { isActiveA: false, isActiveB: false },
        options: { merge: true },
      },
    ]);
  });

  it("refuses a late write from a superseded profile refresh", async () => {
    const harness = transactionHarness(null, {
      "refresh-state": { refreshAttemptId: "new-attempt" },
    });

    await expect(
      reconcileDiscoveryMatch(
        harness.firestore,
        { id: "match" },
        userA,
        userB,
        () => "server-time",
        {
          refreshStateRef: { id: "refresh-state" },
          refreshAttemptId: "old-attempt",
        },
      ),
    ).resolves.toEqual({ status: "superseded" });
    expect(harness.writes).toHaveLength(0);
  });

  it("does not create a match across an account-deletion tombstone", async () => {
    const harness = transactionHarness(null, {
      "refresh-state": { refreshAttemptId: "current-attempt" },
      "candidate-tombstone": { deleting: true },
    });

    await expect(
      reconcileDiscoveryMatch(
        harness.firestore,
        { id: "match" },
        userA,
        userB,
        () => "server-time",
        {
          refreshStateRef: { id: "refresh-state" },
          refreshAttemptId: "current-attempt",
          deletionTombstoneRefs: [{ id: "candidate-tombstone" }],
        },
      ),
    ).resolves.toEqual({ status: "account-deleting" });
    expect(harness.writes).toHaveLength(0);
  });

  it("re-reads both user documents and rejects a block added after the scan", async () => {
    const harness = transactionHarness(null, {
      "refresh-state": { refreshAttemptId: "current-attempt" },
      [userA.uid]: { ...userA, blockedUsers: [userB.uid] },
      [userB.uid]: userB,
    });

    await expect(
      reconcileDiscoveryMatch(
        harness.firestore,
        { id: "match" },
        userA,
        userB,
        () => "server-time",
        {
          refreshStateRef: { id: "refresh-state" },
          refreshAttemptId: "current-attempt",
          participantUserRefs: [
            { uid: userA.uid, ref: { id: userA.uid } },
            { uid: userB.uid, ref: { id: userB.uid } },
          ],
        },
      ),
    ).resolves.toEqual({ status: "blocked" });
    expect(harness.writes).toHaveLength(0);
  });

  it("closes an existing discovery card when current profiles became ineligible", async () => {
    const harness = transactionHarness(
      {
        userA: userA.uid,
        userB: userB.uid,
        matched: false,
        isActiveA: true,
        isActiveB: true,
        source: "discovery",
      },
      {
        "refresh-state": { refreshAttemptId: "current-attempt" },
        [userA.uid]: userA,
        [userB.uid]: { ...userB, media: [] },
      },
    );

    await expect(
      reconcileDiscoveryMatch(
        harness.firestore,
        { id: "match" },
        userA,
        userB,
        () => "server-time",
        {
          refreshStateRef: { id: "refresh-state" },
          refreshAttemptId: "current-attempt",
          participantUserRefs: [
            { uid: userA.uid, ref: { id: userA.uid } },
            { uid: userB.uid, ref: { id: userB.uid } },
          ],
        },
      ),
    ).resolves.toEqual({ status: "closed" });
    expect(harness.writes).toEqual([
      {
        data: { isActiveA: false, isActiveB: false },
        options: { merge: true },
      },
    ]);
  });

  it.each([
    ["matched", { matched: true }, "protected"],
    ["shared", { source: "shared-encounter" }, "protected"],
    ["inactive", { isActiveA: false, isActiveB: false }, "inactive"],
  ])("preserves %s match semantics during closure", async (_label, patch, status) => {
    const harness = transactionHarness({
      userA: userA.uid,
      userB: userB.uid,
      matched: false,
      isActiveA: true,
      isActiveB: true,
      source: "discovery",
      ...patch,
    });

    await expect(
      closeIneligibleDiscoveryMatch(harness.firestore, { id: "match" }),
    ).resolves.toEqual({ status });
    expect(harness.writes).toHaveLength(0);
  });
});

describe("bounded discovery refresh reservations", () => {
  it("fingerprints matching inputs while ignoring unrelated private settings", () => {
    const first = discoveryProfileFingerprint({
      uid: "traveler-a",
      ageMax: 40,
      location: { lng: -73.9, lat: 40.7 },
      notifications: { email: true },
    });
    const reordered = discoveryProfileFingerprint({
      notifications: { email: false },
      location: { lat: 40.7, lng: -73.9 },
      ageMax: 40,
      uid: "traveler-a",
    });
    const changed = discoveryProfileFingerprint({
      uid: "traveler-a",
      ageMax: 41,
      location: { lat: 40.7, lng: -73.9 },
    });

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("coalesces repeated refreshes for the same profile during the cooldown", async () => {
    const harness = refreshStateHarness();
    const stateRef = { id: "traveler-a" };
    const now = 1_000_000;

    await expect(
      reserveDiscoveryRefresh(harness.firestore, stateRef, {
        fingerprint: "same-profile",
        now,
        attemptId: "first-attempt",
      }),
    ).resolves.toEqual({ acquired: true, attemptId: "first-attempt" });
    await expect(
      reserveDiscoveryRefresh(harness.firestore, stateRef, {
        fingerprint: "same-profile",
        now: now + DISCOVERY_REFRESH_COOLDOWN_MS - 1,
        attemptId: "duplicate-attempt",
      }),
    ).resolves.toEqual({ acquired: false, reason: "cooldown" });

    expect(harness.writes).toHaveLength(1);
  });

  it("caps profile-changing refreshes within a fixed server window", async () => {
    const harness = refreshStateHarness();
    const stateRef = { id: "traveler-a" };
    const now = 2_000_000;

    for (let index = 0; index < DISCOVERY_REFRESH_WINDOW_MAX; index += 1) {
      await expect(
        reserveDiscoveryRefresh(harness.firestore, stateRef, {
          fingerprint: `profile-${index}`,
          now: now + index,
          attemptId: `attempt-${index}`,
        }),
      ).resolves.toEqual({ acquired: true, attemptId: `attempt-${index}` });
    }
    await expect(
      reserveDiscoveryRefresh(harness.firestore, stateRef, {
        fingerprint: "one-too-many",
        now: now + DISCOVERY_REFRESH_WINDOW_MAX,
        attemptId: "one-too-many-attempt",
      }),
    ).resolves.toEqual({ acquired: false, reason: "rate-limit" });
    await expect(
      reserveDiscoveryRefresh(harness.firestore, stateRef, {
        fingerprint: "next-window",
        now: now + DISCOVERY_REFRESH_WINDOW_MS,
        attemptId: "next-window-attempt",
      }),
    ).resolves.toEqual({
      acquired: true,
      attemptId: "next-window-attempt",
    });

    expect(harness.getState()).toEqual(
      expect.objectContaining({
        profileFingerprint: "next-window",
        refreshAttemptId: "next-window-attempt",
        windowCount: 1,
      }),
    );
  });
});
