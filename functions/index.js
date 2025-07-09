const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const functions = require("firebase-functions");
const sgMail = require("@sendgrid/mail");

initializeApp();
const db = getFirestore();
const auth = getAuth();

// Helper functions
async function sendEmail(to, subject, text) {
  const SENDGRID_KEY = functions.config().sendgrid.key;
  try {
    if (!SENDGRID_KEY || !SENDGRID_KEY.startsWith('SG.')) {
      console.error('[SendGrid] API key is missing or invalid. Key prefix:', SENDGRID_KEY ? SENDGRID_KEY.slice(0, 3) : 'undefined');
      throw new Error('SendGrid API key is missing or invalid.');
    }
    sgMail.setApiKey(SENDGRID_KEY);
    await sgMail.send({
      to,
      from: "datescapenotifications@gmail.com",
      subject,
      text,
    });
    console.log(`[SendGrid] Email sent to: ${to}`);
  } catch (err) {
    console.error(`[SendGrid] Failed to send email to ${to}:`, err);
    throw err;
  }
}

// async function sendSMS(to, body) {
//   await twilioClient.messages.create({
//     body,
//     from: functions.config().twilio.number,
//     to,
//   });
// }

// Match Activated Trigger
exports.notifyOnMatchActivated = onDocumentUpdated("matches/{matchId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (!before.matched && after.matched) {
    const { userIds } = after;
    const matchId = event.params.matchId;

    for (const userId of userIds) {
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data();

      if (
        !userData ||
        !userData.notifications ||
        userData.active ||
        userData.notifications.lastMatchNotified === matchId
      ) continue;

      const email = userData.notifications.emailEnabled && userData.notifications.email;
      const phone = userData.notifications.smsEnabled && userData.notifications.phone;

      const message = "You have a new match on DateScape!";
      
      // Create notification document in user's notifications subcollection
      try {
        const notificationRef = db.collection("users").doc(userId).collection("notifications").doc();
        await notificationRef.set({
          text: message,
          type: "new_match",
          matchId: matchId,
          timestamp: new Date(),
          read: false
        });
        console.log("✅ Match notification document created for user:", userId);
      } catch (error) {
        console.error("❌ Failed to create match notification document:", error);
      }

      if (email) await sendEmail(email, "New Match", message);
      // if (phone) await sendSMS(phone, message);

      await userRef.update({
        "notifications.lastMatchNotified": matchId,
      });
    }
  }
});

// New Message Trigger
exports.notifyOnNewMessage = onDocumentCreated("matches/{matchId}/messages/{messageId}", async (event) => {
  const message = event.data.data();
  const matchId = event.params.matchId;

  console.log("🔔 [notifyOnNewMessage] Triggered for match:", matchId, "message:", event.params.messageId);
  console.log("[notifyOnNewMessage] Message data:", message);

  const matchSnap = await db.collection("matches").doc(matchId).get();
  const matchData = matchSnap.data();

  if (!matchData) {
    console.log("❌ [notifyOnNewMessage] No match data found for:", matchId);
    return;
  }

  // Get user IDs from userIds or participants
  const userIds = matchData.userIds || matchData.participants || [];
  const recipientId = userIds.find(uid => uid !== message.senderId);
  console.log("[notifyOnNewMessage] Recipient ID:", recipientId);

  if (!recipientId) {
    console.log("❌ [notifyOnNewMessage] No recipientId found. userIds:", userIds, "senderId:", message.senderId);
    return;
  }

  // Fetch sender's displayName
  let senderName = "Someone";
  try {
    const senderSnap = await db.collection("users").doc(message.senderId).get();
    const senderData = senderSnap.data();
    if (senderData && senderData.displayName) senderName = senderData.displayName;
    else if (senderData && senderData.name) senderName = senderData.name;
  } catch (e) {
    console.log("[notifyOnNewMessage] Could not fetch sender displayName:", e);
  }

  const userSnap = await db.collection("users").doc(recipientId).get();
  const userData = userSnap.data();

  if (!userData || !userData.notifications) {
    console.log("❌ [notifyOnNewMessage] No user data or notifications found");
    return;
  }

  // Only send one email per inactive session
  const email = userData.notifications.emailEnabled && userData.notifications.email;
  const lastSessionNotified = userData.notifications.lastSessionNotified;
  let shouldSendEmail = false;
  console.log('[notifyOnNewMessage] Email decision:', {
    email,
    lastSessionNotified,
    matchId,
    userActive: userData.active
  });
  if (email && lastSessionNotified !== matchId && !userData.active) {
    shouldSendEmail = true;
  }
  console.log('[notifyOnNewMessage] shouldSendEmail:', shouldSendEmail);

  // Check for existing unread notification for this sender+match
  const notifQuery = await db.collection("users").doc(recipientId)
    .collection("notifications")
    .where("type", "==", "new_message")
    .where("senderId", "==", message.senderId)
    .where("matchId", "==", matchId)
    .where("read", "==", false)
    .get();
  if (!notifQuery.empty) {
    console.log("[notifyOnNewMessage] Unread notification already exists for this sender+match, skipping creation.");
  } else {
    // Create descriptive in-app notification
    const notificationRef = db.collection("users").doc(recipientId).collection("notifications").doc();
    await notificationRef.set({
      text: `You have new messages from ${senderName}!`,
      type: "new_message",
      matchId: matchId,
      senderId: message.senderId,
      senderName: senderName,
      timestamp: new Date(),
      read: false
    });
    console.log("✅ [notifyOnNewMessage] In-app notification created for user:", recipientId);
  }

  // Send email if needed
  if (shouldSendEmail) {
    try {
      await sendEmail(email, "New Messages", "You have new messages on DateScape!");
      console.log("✅ [notifyOnNewMessage] Email sent to:", email);
    } catch (error) {
      console.error("❌ [notifyOnNewMessage] Failed to send email:", error);
    }
    await userSnap.ref.update({
      "notifications.lastSessionNotified": matchId,
    });
  }

  console.log("✅ [notifyOnNewMessage] Notification process completed");
});
