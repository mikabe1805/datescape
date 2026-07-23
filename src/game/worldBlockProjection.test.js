const {
  blockEdgeUpdates,
  blockedUidSet,
  blockFilterUpdates,
  closeBlockedMatchDocument,
  realtimePairCleanupUpdates,
  safeWorldUid,
  syncWorldBlockProjection,
} = require("../../functions/worldBlockProjection");

function fakeRealtimeDatabase(initial = {}) {
  const values = new Map(Object.entries(initial));
  const appliedUpdates = [];
  const applyUpdates = async (updates) => {
    appliedUpdates.push(updates);
    Object.entries(updates).forEach(([path, value]) => {
      if (value === null) values.delete(path);
      else values.set(path, value);
    });
  };
  return {
    appliedUpdates,
    ref(path) {
      if (!path) return { update: applyUpdates };
      return {
        get: async () => ({ val: () => values.get(path) ?? null }),
      };
    },
  };
}

describe("server-owned reciprocal world block projection", () => {
  it("normalizes legacy block lists without admitting unsafe RTDB keys", () => {
    expect([...blockedUidSet({ blockedUsers: ["traveler-b", "bad/key"] })]).toEqual([
      "traveler-b",
    ]);
    expect([
      ...blockedUidSet({ profile: { blockedUsers: ["traveler-c"] } }),
    ]).toEqual(["traveler-c"]);
    expect(safeWorldUid("traveler-a")).toBe("traveler-a");
    expect(safeWorldUid("bad.uid")).toBeNull();
  });

  it("projects only the actor's directional edge and removes stale edges", () => {
    expect(
      blockEdgeUpdates(
        "traveler-a",
        { blockedUsers: ["traveler-old"] },
        { blockedUsers: ["traveler-b"] },
      ),
    ).toEqual({
      affectedUids: ["traveler-b", "traveler-old"],
      updates: {
        "worldBlockEdges/traveler-a/traveler-b": true,
        "worldBlockEdges/traveler-a/traveler-old": null,
      },
    });
    expect(
      blockEdgeUpdates(
        "traveler-a",
        { blockedUsers: ["traveler-b"] },
        { blockedUsers: ["traveler-b"] },
      ),
    ).toEqual({ affectedUids: [], updates: {} });
  });

  it("gives both clients the same directionless filter result", () => {
    expect(blockFilterUpdates("traveler-a", "traveler-b", true)).toEqual({
      "worldBlockFilters/traveler-a/traveler-b": true,
      "worldBlockFilters/traveler-b/traveler-a": true,
    });
    expect(blockFilterUpdates("traveler-a", "traveler-b", false)).toEqual({
      "worldBlockFilters/traveler-a/traveler-b": null,
      "worldBlockFilters/traveler-b/traveler-a": null,
    });
  });

  it("keeps the symmetric filter when only the other direction remains", async () => {
    const database = fakeRealtimeDatabase({
      "worldBlockEdges/traveler-b/traveler-a": true,
      "worldBlockEdges/traveler-a/traveler-b": true,
    });

    await syncWorldBlockProjection(
      database,
      "traveler-a",
      { blockedUsers: ["traveler-b"] },
      { blockedUsers: [] },
    );

    expect(database.appliedUpdates).toEqual([
      { "worldBlockEdges/traveler-a/traveler-b": null },
      {
        "worldBlockFilters/traveler-a/traveler-b": true,
        "worldBlockFilters/traveler-b/traveler-a": true,
      },
    ]);
  });

  it("purges queued pair interactions without issuing stale station deletes", () => {
    expect(
      realtimePairCleanupUpdates(
        {
          signalsForUid: {
            fromOther: { fromUid: "traveler-b" },
            fromFriend: { fromUid: "traveler-c" },
          },
          signalsForOtherUid: {
            fromUid: { fromUid: "traveler-a" },
          },
        },
        "traveler-a",
        "traveler-b",
      ),
    ).toEqual({
      "worldLikesByRecipient/traveler-a/traveler-b": null,
      "worldLikesByRecipient/traveler-b/traveler-a": null,
      "worldSignalRateLimits/traveler-a/traveler-b": null,
      "worldSignalRateLimits/traveler-b/traveler-a": null,
      "signals/traveler-a/fromOther": null,
      "signals/traveler-b/fromUid": null,
    });
  });

  it("closes every canonical consent flag and propagates real write failures", async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    await expect(
      closeBlockedMatchDocument({ update }, { arrayUnion: "traveler-a" }),
    ).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({
      isActiveA: false,
      isActiveB: false,
      likedByA: false,
      likedByB: false,
      matched: false,
      blockedBy: { arrayUnion: "traveler-a" },
    });

    const failure = new Error("firestore unavailable");
    await expect(
      closeBlockedMatchDocument(
        { update: jest.fn().mockRejectedValue(failure) },
        "blocked-by",
      ),
    ).rejects.toBe(failure);
    await expect(
      closeBlockedMatchDocument(
        {
          update: jest.fn().mockRejectedValue({ code: "not-found" }),
        },
        "blocked-by",
      ),
    ).resolves.toBe(false);
  });
});
