import {
  avatarAuthorityIsReady,
  expeditionReceiptSyncDisposition,
  lanternkeeperCompletionCopy,
  mutationWasConfirmed,
  questActionIsConfirmed,
  resonanceEchoIsEligible,
  selectVisibleWorldCohort,
  sharedEncounterForAfterglow,
} from "./worldPageAuthority";

describe("WorldPage authority guards", () => {
  test("waits for both active-UID avatar sources before allowing writes", () => {
    expect(
      avatarAuthorityIsReady({
        authUid: "traveler-a",
        profileHydratedUid: "traveler-a",
        progressionHydratedUid: null,
      }),
    ).toBe(false);
    expect(
      avatarAuthorityIsReady({
        authUid: "traveler-a",
        profileHydratedUid: "traveler-a",
        progressionHydratedUid: "traveler-a",
      }),
    ).toBe(true);
  });

  test("does not reuse settled gates from a previous UID", () => {
    expect(
      avatarAuthorityIsReady({
        authUid: "traveler-b",
        profileHydratedUid: "traveler-a",
        progressionHydratedUid: "traveler-a",
      }),
    ).toBe(false);
  });

  test("keeps signed-out preview and local play available", () => {
    expect(
      avatarAuthorityIsReady({
        authUid: null,
        preview: true,
        profileHydratedUid: null,
        progressionHydratedUid: null,
      }),
    ).toBe(true);
  });

  test("lets confirmed quest state override an uncertain transport result", () => {
    expect(questActionIsConfirmed("accept", "active")).toBe(true);
    expect(questActionIsConfirmed("accept", "ready-to-turn-in")).toBe(true);
    expect(questActionIsConfirmed("accept", "completed")).toBe(true);
    expect(questActionIsConfirmed("accept", "available")).toBe(false);
    expect(questActionIsConfirmed("turn-in", "completed")).toBe(true);
    expect(questActionIsConfirmed("turn-in", "ready-to-turn-in")).toBe(false);
  });

  test("retries expedition receipts only while an accepted quest is active", () => {
    expect(expeditionReceiptSyncDisposition("active")).toBe("retry");
    expect(expeditionReceiptSyncDisposition("ready-to-turn-in")).toBe(
      "confirmed",
    );
    expect(expeditionReceiptSyncDisposition("completed")).toBe("confirmed");
    expect(expeditionReceiptSyncDisposition("available")).toBe("settled");
    expect(expeditionReceiptSyncDisposition("locked")).toBe("settled");
  });

  test("only treats applied or duplicate expedition mutations as confirmed", () => {
    expect(mutationWasConfirmed({ applied: true })).toBe(true);
    expect(mutationWasConfirmed({ duplicate: true })).toBe(true);
    expect(mutationWasConfirmed({ ignored: true })).toBe(false);
    expect(mutationWasConfirmed({})).toBe(false);
  });

  test("uses personal confirmation or neutral Lanternkeeper completion copy", () => {
    expect(lanternkeeperCompletionCopy("ready-to-turn-in")).toContain(
      "Your verified quest receipt",
    );
    expect(lanternkeeperCompletionCopy("completed")).toContain(
      "no quest rewards",
    );
    const neutral = lanternkeeperCompletionCopy("active");
    expect(neutral).toContain("verified for each traveler individually");
    expect(neutral).not.toContain("Every active party member");
  });

  test("offers Resonance Echo only at the active Sunthread duet objective", () => {
    const quest = { id: "afterlight-sunthread", status: "active" };
    expect(
      resonanceEchoIsEligible(quest, {
        id: "resonate-together",
        status: "current",
      }),
    ).toBe(true);
    expect(
      resonanceEchoIsEligible(
        { ...quest, status: "ready-to-turn-in" },
        { id: "resonate-together", status: "complete" },
      ),
    ).toBe(false);
    expect(
      resonanceEchoIsEligible(quest, {
        id: "recover-rain-prism",
        status: "current",
      }),
    ).toBe(false);
  });

  test("binds a verified encounter to the exact shared-activity afterglow", () => {
    const encounters = [
      {
        id: "encounter-old",
        mode: "resonance",
        sourceId: "match-old",
        opponent: { uid: "traveler-b" },
      },
      {
        id: "encounter-current",
        mode: "resonance",
        sourceId: "match-current",
        opponent: { uid: "traveler-b" },
      },
      {
        id: "encounter-social",
        mode: "social",
        sourceId: "match-social",
        opponent: { uid: "traveler-b" },
      },
    ];
    expect(
      sharedEncounterForAfterglow(encounters, {
        mode: "resonance",
        matchId: "match-current",
        opponent: { uid: "traveler-b" },
      })?.id,
    ).toBe("encounter-current");
    expect(
      sharedEncounterForAfterglow(encounters, {
        mode: "social",
        matchId: "match-social",
        opponent: { uid: "traveler-b" },
      })?.id,
    ).toBe("encounter-social");
    expect(
      sharedEncounterForAfterglow(encounters, {
        mode: "social",
        matchId: "match-current",
      }),
    ).toBeNull();
  });

  test("keeps the world cohort nearby, bounded, blocked-safe, and stable", () => {
    const players = Array.from({ length: 20 }, (_, index) => ({
      uid: `traveler-${String(index).padStart(2, "0")}`,
      x: index,
      z: 0,
      say: { text: `hello ${index}` },
    }));
    players.push({ uid: "traveler-tie-b", x: 1, z: 1 });
    players.push({ uid: "traveler-tie-a", x: -1, z: -1 });

    const selected = selectVisibleWorldCohort(players, { x: 0, z: 0 }, {
      blockedUids: ["traveler-00"],
      mutedUids: ["traveler-01"],
    });

    expect(selected).toHaveLength(16);
    expect(selected.some((player) => player.uid === "traveler-00")).toBe(false);
    expect(selected.find((player) => player.uid === "traveler-01")?.say).toBeNull();
    expect(selected.map((player) => player.uid).slice(0, 3)).toEqual([
      "traveler-01",
      "traveler-tie-a",
      "traveler-tie-b",
    ]);
    expect(players[1].say).toEqual({ text: "hello 1" });
  });
});
