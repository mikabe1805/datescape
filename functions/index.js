const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const functions = require("firebase-functions");
const sgMail = require("@sendgrid/mail");

initializeApp();
const db = getFirestore();
const auth = getAuth();

sgMail.setApiKey(process.env.SENDGRID_KEY);

// Helper functions
async function sendEmail(to, subject, text) {
  await sgMail.send({
    to,
    from: "datescapenotifications@gmail.com",
    subject,
    text,
  });
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

  const matchSnap = await db.collection("matches").doc(matchId).get();
  const matchData = matchSnap.data();

  const recipientId = matchData.userIds.find(uid => uid !== message.senderId);
  const userSnap = await db.collection("users").doc(recipientId).get();
  const userData = userSnap.data();

  if (!userData || !userData.notifications || userData.notifications.lastSessionNotified === matchId) return;

  const email = userData.notifications.emailEnabled && userData.notifications.email;
  const phone = userData.notifications.smsEnabled && userData.notifications.phone;

  const text = "You have new messages on DateScape!";
  if (email) await sendEmail(email, "New Messages", text);
  // if (phone) await sendSMS(phone, text);

  await userSnap.ref.update({
    "notifications.lastSessionNotified": matchId,
  });
});
