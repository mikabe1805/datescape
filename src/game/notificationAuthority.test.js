const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const functionsSource = fs.readFileSync(
  path.join(root, "functions", "index.js"),
  "utf8",
);
const notifications = functionsSource.slice(
  functionsSource.indexOf("function getMatchParticipants"),
  functionsSource.indexOf("exports.migrateRaceToEthnicity"),
);

describe("notification lifecycle authority", () => {
  it("validates the current matched, active, unblocked canonical pair", () => {
    expect(notifications).toContain("loadCurrentMatchNotificationContext(");
    expect(notifications).toContain("if (match.matched !== true) return null");
    expect(notifications).toContain("exactCurrentMatchParticipants(match)");
    expect(notifications).toContain("loadAccountAdmission(participants, transaction)");
    expect(notifications).toContain("if (!admission.active) return null");
    expect(notifications).toContain("matchPairIsBlocked(");
  });

  it("reserves one deterministic in-app notification in the lifecycle transaction", () => {
    const reserve = notifications.slice(
      notifications.indexOf("async function reserveCurrentMatchNotification"),
      notifications.indexOf("async function updateCurrentNotificationUser"),
    );
    expect(reserve).toContain("db.runTransaction(async (transaction)");
    expect(reserve).toContain("loadCurrentMatchNotificationContext(");
    expect(reserve).toContain("notificationDocumentId(type, matchId, senderId)");
    expect(reserve).toContain("notificationDeliveryKey(eventId)");
    expect(reserve).toContain("transaction.set(");
    expect(reserve).not.toContain(".add(");
  });

  it("revalidates immediately before push, email, and notification setting writes", () => {
    const delivery = notifications.slice(
      notifications.indexOf("async function updateCurrentNotificationUser"),
      notifications.indexOf("async function handleMatchActivated"),
    );
    expect(
      (delivery.match(/loadCurrentMatchNotificationContext\(/g) || []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(delivery).toContain("updateCurrentNotificationUser({");
    expect(delivery).not.toContain("userRef.update(");
  });

  it("covers matched document creation and the false-to-true update without overlap", () => {
    expect(notifications).toContain("exports.notifyOnMatchCreated = onDocumentCreated");
    expect(notifications).toContain("event.data.data()?.matched !== true");
    expect(notifications).toContain("exports.notifyOnMatchActivated = onDocumentUpdated");
    expect(notifications).toContain("if (before.matched || !after.matched) return");
    expect(
      (notifications.match(/handleMatchActivated\(event\.params\.matchId, event\.id\)/g) || [])
        .length,
    ).toBe(2);
  });

  it("requires a current participant sender before a message can notify", () => {
    const message = notifications.slice(
      notifications.indexOf("exports.notifyOnNewMessage"),
    );
    expect(message).toContain("loadCurrentMatchNotificationContext(matchId)");
    expect(message).toContain("context.participants.includes(senderId)");
    expect(message).toContain("reserveCurrentMatchNotification({");
    expect(message).not.toContain("notificationsRef.add(");
  });
});
