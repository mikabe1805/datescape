const fs = require("node:fs");
const path = require("node:path");
const {
  SAFETY_REPORT_RATE_LIMIT_MAX,
  SAFETY_REPORT_RATE_LIMIT_WINDOW_MS,
  normalizeSafetyReportRequest,
  reserveSafetyReportRateWindow,
} = require("../../functions/safetyReport");

const functionsSource = fs.readFileSync(
  path.resolve(__dirname, "../../functions/index.js"),
  "utf8",
);
const clientSource = fs.readFileSync(
  path.resolve(__dirname, "../utils/MatchActions.js"),
  "utf8",
);

describe("server-authoritative safety reports", () => {
  it("normalizes the two exact report schemas without trusting reporter fields", () => {
    expect(
      normalizeSafetyReportRequest(
        {
          type: "user",
          reportedUserId: "traveler-b",
          reason: "  Context  ",
        },
        "traveler-a",
      ),
    ).toEqual({
      ok: true,
      report: {
        type: "user",
        reportedUserId: "traveler-b",
        reason: "Context",
      },
    });
    expect(
      normalizeSafetyReportRequest(
        {
          type: "photo",
          reportedUserId: "traveler-b",
          photoUrl: "https://cdn.example.test/photo.jpg?token=private",
        },
        "traveler-a",
      ),
    ).toEqual({
      ok: true,
      report: {
        type: "photo",
        reportedUserId: "traveler-b",
        photoUrl: "https://cdn.example.test/photo.jpg?token=private",
        reason: null,
      },
    });
  });

  it("rejects self-reports, extra authority fields, and oversized reasons", () => {
    expect(
      normalizeSafetyReportRequest(
        { type: "user", reportedUserId: "traveler-a" },
        "traveler-a",
      ).ok,
    ).toBe(false);
    expect(
      normalizeSafetyReportRequest(
        {
          type: "user",
          reportedUserId: "traveler-b",
          reporterId: "forged-reporter",
        },
        "traveler-a",
      ).ok,
    ).toBe(false);
    expect(
      normalizeSafetyReportRequest(
        {
          type: "user",
          reportedUserId: "traveler-b",
          reason: "x".repeat(1001),
        },
        "traveler-a",
      ).ok,
    ).toBe(false);
    expect(
      normalizeSafetyReportRequest(
        {
          type: "user",
          reportedUserId: "traveler-b",
          reason: " ".repeat(1001),
        },
        "traveler-a",
      ).ok,
    ).toBe(false);
  });

  it("accepts only bounded, credential-free HTTPS photo URLs", () => {
    [
      "http://example.test/photo.jpg",
      "https://",
      "https://user:secret@example.test/photo.jpg",
      `https://example.test/${"x".repeat(2048)}`,
    ].forEach((photoUrl) => {
      expect(
        normalizeSafetyReportRequest(
          { type: "photo", reportedUserId: "traveler-b", photoUrl },
          "traveler-a",
        ).ok,
      ).toBe(false);
    });
  });

  it("transactionally bounds each reporter to ten submissions per rolling hour", () => {
    const now = 1_000_000;
    let state = null;
    for (let index = 0; index < SAFETY_REPORT_RATE_LIMIT_MAX; index += 1) {
      const reservation = reserveSafetyReportRateWindow(state, now + index);
      expect(reservation.allowed).toBe(true);
      state = { acceptedAt: reservation.acceptedAt };
    }
    expect(
      reserveSafetyReportRateWindow(
        state,
        now + SAFETY_REPORT_RATE_LIMIT_MAX,
      ).allowed,
    ).toBe(false);
    expect(
      reserveSafetyReportRateWindow(
        state,
        now + SAFETY_REPORT_RATE_LIMIT_WINDOW_MS,
      ).allowed,
    ).toBe(true);
  });

  it("wires report creation and rate reservation into one trusted transaction", () => {
    const callableSource = functionsSource.slice(
      functionsSource.indexOf("exports.submitSafetyReport = onCall"),
      functionsSource.indexOf("exports.syncWorldBlockProjection ="),
    );
    expect(callableSource).toContain("normalizeSafetyReportRequest(");
    expect(callableSource).toContain("accountDeletionTombstoneRef(reporterUid)");
    expect(callableSource).toContain("await db.runTransaction(");
    expect(callableSource).toContain("reserveSafetyReportRateWindow(");
    expect(callableSource).toContain("transaction.create(reportRef");
    expect(callableSource).toContain("reporterId: reporterUid");
    expect(callableSource).not.toMatch(/blockedUsers|hasLanternkeeperBlock/);

    expect(clientSource).toContain(
      'httpsCallable(functions, "submitSafetyReport")',
    );
    expect(clientSource).not.toMatch(/addDoc\s*\(|collection\s*\([^)]*["']reports/);
  });

  it("removes the private reporter counter during account deletion", () => {
    const deletionSource = functionsSource.slice(
      functionsSource.indexOf("exports.deleteMyAccount = onCall"),
    );
    expect(deletionSource).toContain(
      "db.collection(SAFETY_REPORT_RATE_LIMIT_COLLECTION).doc(uid)",
    );
  });
});
