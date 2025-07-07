// functions/index.js
const { onAuthStateChanged } = require("firebase/auth");
const { doc, updateDoc, getDoc } = require("firebase/firestore");
const { auth, db } = require("./firebase");

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const twilio = require("twilio");

admin.initializeApp();

sgMail.setApiKey(functions.config().sendgrid.key);
const twilioClient = twilio(functions.config().twilio.sid, functions.config().twilio.token);

// Helper: Send email
async function sendEmail(to, subject, text) {
  await sgMail.send({
    to,
    from: "datescapenotifications@gmail.com",
    subject,
    text,
  });
}

// Helper: Send SMS
async function sendSMS(to, body) {
  await twilioClient.messages.create({
    body,
    from: functions.config().twilio.number,
    to,
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userRef = doc(db, "users", user.uid);

    try {
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const userData = docSnap.data();

        // Save user as active
        await updateDoc(userRef, {
          isActive: true,
          lastLogin: new Date()
        });

        // Optionally: store notifications settings in global state
        console.log("Notification settings:", userData.notifications);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  }
});


exports.notifyOnMatchActivated = functions.firestore
  .document("matches/{matchId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Trigger only when a match becomes active
    if (!before.matched && after.matched) {
      const { userIds } = after;
      const matchId = context.params.matchId;

      for (const userId of userIds) {
        const userRef = admin.firestore().collection("users").doc(userId);
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
        if (phone) await sendSMS(phone, message);

        await userRef.update({
          "notifications.lastMatchNotified": matchId,
        });
      }
    }
  });


// Trigger on new message
exports.notifyOnNewMessage = functions.firestore
  .document("matches/{matchId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const matchId = context.params.matchId;
    const matchSnap = await admin.firestore().collection("matches").doc(matchId).get();
    const matchData = matchSnap.data();

    const recipientId = matchData.userIds.find(uid => uid !== message.senderId);
    const userSnap = await admin.firestore().collection("users").doc(recipientId).get();
    const userData = userSnap.data();

    if (!userData || !userData.notifications || userData.notifications.lastSessionNotified === matchId) return;

    const email = userData.notifications.emailEnabled && userData.notifications.email;
    const phone = userData.notifications.smsEnabled && userData.notifications.phone;

    const text = "You have new messages on DateScape!";
    if (email) await sendEmail(email, "New Messages", text);
    if (phone) await sendSMS(phone, text);

    await userSnap.ref.update({
      "notifications.lastSessionNotified": matchId,
    });
  });
