const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const sgMail = require("@sendgrid/mail");
const { defineSecret } = require("firebase-functions/params");

initializeApp();
const db = getFirestore();

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

// Helper to send email via SendGrid
async function sendEmail(to, subject, text) {
  const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_KEY || !SENDGRID_KEY.startsWith("SG.")) {
    console.error("[SendGrid] Missing or invalid API key.");
    return;
  }
  sgMail.setApiKey(SENDGRID_KEY);
  await sgMail.send({ to, from: "datescapenotifications@gmail.com", subject, text });
  console.log(`[SendGrid] Email sent to ${to}`);
}

// Match Activated Trigger
exports.notifyOnMatchActivated = onDocumentUpdated(
  {
    document: "matches/{matchId}",
    secrets: [SENDGRID_API_KEY]
  },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before.matched && after.matched) {
      const matchId = event.params.matchId;
      const { userIds } = after;
      for (const userId of userIds) {
        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();
        const userData = userSnap.data();
        if (!userData || !userData.notifications || userData.active) continue;

        const email = userData.notifications.emailEnabled && userData.notifications.email;
        const notifiedMatchWhileInactive = userData.notifications.notifiedMatchWhileInactive || false;
        const shouldSendEmail = email && !userData.active && !notifiedMatchWhileInactive;
        const message = "You have a new match on DateScape!";

        // In-app notification (avoid duplicates)
        const existing = await db.collection("users").doc(userId).collection("notifications")
          .where("type", "==", "new_match").where("matchId", "==", matchId)
          .where("read", "==", false).limit(1).get();
        if (existing.empty) {
          await db.collection("users").doc(userId).collection("notifications").add({
            text: message,
            type: "new_match",
            matchId,
            timestamp: new Date(),
            read: false
          });
          console.log("[notifyOnMatchActivated] In-app notification created for", userId);
        }

        if (shouldSendEmail) {
          await sendEmail(email, "New Match", message);
          await userRef.update({ "notifications.notifiedMatchWhileInactive": true });
          console.log("[notifyOnMatchActivated] Email sent and flag updated for", userId);
        }
      }
    }
  }
);

// New Message Trigger
exports.notifyOnNewMessage = onDocumentCreated(
  {
    document: "matches/{matchId}/messages/{messageId}",
    secrets: [SENDGRID_API_KEY]
  },
  async (event) => {
    const message = event.data.data();
    const matchId = event.params.matchId;
    console.log("🔔 [notifyOnNewMessage] Triggered for match", matchId);

    const matchSnap = await db.collection("matches").doc(matchId).get();
    const matchData = matchSnap.data();
    if (!matchData) return;

    const userIds = matchData.userIds || matchData.participants || [];
    const recipientId = userIds.find((id) => id !== message.senderId);
    if (!recipientId) return;

    // Fetch sender name
    let senderName = "Someone";
    const senderSnap = await db.collection("users").doc(message.senderId).get();
    const senderData = senderSnap.data();
    if (senderData?.displayName) senderName = senderData.displayName;

    const userSnap = await db.collection("users").doc(recipientId).get();
    const userData = userSnap.data();
    if (!userData || !userData.notifications) return;

    // Email logic
    const email = userData.notifications.emailEnabled && userData.notifications.email;
    const notifiedWhileInactive = userData.notifications.notifiedWhileInactive || false;
    const shouldSendEmail = email && !userData.active && !notifiedWhileInactive;

    // In-app notification (avoid duplicates)
    const existing = await db.collection("users").doc(recipientId).collection("notifications")
      .where("type", "==", "new_message").where("senderId", "==", message.senderId)
      .where("matchId", "==", matchId).where("read", "==", false).limit(1).get();
    if (existing.empty) {
      await db.collection("users").doc(recipientId).collection("notifications").add({
        text: `You have new messages from ${senderName}!`,
        type: "new_message",
        matchId,
        senderId: message.senderId,
        senderName,
        timestamp: new Date(),
        read: false
      });
      console.log("[notifyOnNewMessage] In-app notification created for", recipientId);
    }

    if (shouldSendEmail) {
      await sendEmail(email, "New Messages", "You have new messages on DateScape!");
      await userSnap.ref.update({ "notifications.notifiedWhileInactive": true });
      console.log("[notifyOnNewMessage] Email sent and flag updated for", recipientId);
    }
  }
);
