import {
  appendSharedMomentReceipt,
  hydrateSharedMomentReceipts,
  sharedMomentReceiptId,
} from "./sharedMomentReceipts";

describe("private shared-moment receipts", () => {
  it("creates a participant-local id without partner data", () => {
    expect(sharedMomentReceiptId("resonance", "duet-a-b")).toBe(
      "resonance:duet-a-b",
    );
    expect(sharedMomentReceiptId("chess", "match-a-b")).toBeNull();
  });

  it("records the same match exactly once", () => {
    const receipt = {
      mode: "resonance",
      matchId: "duet-a-b",
      completedAt: 1_000,
    };
    const first = appendSharedMomentReceipt([], receipt);
    const duplicate = appendSharedMomentReceipt(first, {
      ...receipt,
      completedAt: 2_000,
    });

    expect(duplicate).toEqual(first);
    expect(duplicate).toHaveLength(1);
  });

  it("drops malformed persisted records and bounds the private journal", () => {
    const values = Array.from({ length: 30 }, (_, index) => ({
      mode: index % 2 ? "social" : "resonance",
      matchId: `shared-${index}`,
      completedAt: index + 1,
    }));
    values.push({ mode: "social", matchId: "", completedAt: -1 });

    const receipts = hydrateSharedMomentReceipts(values);
    expect(receipts).toHaveLength(24);
    expect(receipts[0].matchId).toBe("shared-6");
    expect(receipts.at(-1).matchId).toBe("shared-29");
  });
});
