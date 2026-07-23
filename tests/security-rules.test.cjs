const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");
const {
  get: getDatabaseValue,
  limitToFirst,
  orderByChild,
  query,
  ref: databaseRef,
  remove: removeDatabaseValue,
  set: setDatabaseValue,
} = require("firebase/database");
const {
  deleteObject,
  listAll,
  ref: storageRef,
  uploadBytes,
} = require("firebase/storage");

const PROJECT_ID = "demo-date-scape-rules";
const ROOM_ID = "afterlight-market-garden-v1";
const ROOT = path.resolve(__dirname, "..");
const ALICE_SESSION = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BOB_SESSION = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CAROL_SESSION = "cccccccccccccccccccccccccccccccc";

let testEnvironment;

function rulesFile(filename) {
  return fs.readFileSync(path.join(ROOT, filename), "utf8");
}

function auth(uid) {
  return testEnvironment.authenticatedContext(uid);
}

async function asAdmin(operation) {
  return testEnvironment.withSecurityRulesDisabled(operation);
}

async function seedFirestore(documents) {
  await asAdmin(async (context) => {
    await Promise.all(
      documents.map(([documentPath, data]) =>
        setDoc(doc(context.firestore(), documentPath), data)
      )
    );
  });
}

async function seedDatabase(data) {
  await asAdmin((context) =>
    setDatabaseValue(databaseRef(context.database()), data)
  );
}

function matchData({ matched }) {
  return {
    userA: "alice",
    userB: "bob",
    participants: ["alice", "bob"],
    likedByA: true,
    likedByB: true,
    isActiveA: false,
    isActiveB: false,
    matched,
  };
}

function messageData(senderId = "alice") {
  return {
    senderId,
    text: "hello",
    mediaURL: null,
    type: "text",
    timestamp: serverTimestamp(),
    isRead: false,
  };
}

function stationSeat(name, sessionId, sitAt) {
  return {
    name,
    color: "#4477aa",
    sitAt,
    sessionId,
  };
}

function stationMatch() {
  const now = Date.now();
  return {
    id: "chess-table-match-1",
    white: "alice",
    black: "bob",
    whiteSeatSessionId: ALICE_SESSION,
    blackSeatSessionId: BOB_SESSION,
    startedAt: now,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    lastMoveAt: now,
  };
}

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: rulesFile("firestore.rules") },
    database: { rules: rulesFile("database.rules.json") },
    storage: { rules: rulesFile("storage.rules") },
  });

  await Promise.all([
    testEnvironment.clearFirestore(),
    testEnvironment.clearDatabase(),
    testEnvironment.clearStorage(),
  ]);
});

after(async () => {
  if (!testEnvironment) return;

  await Promise.all([
    testEnvironment.clearFirestore(),
    testEnvironment.clearDatabase(),
    testEnvironment.clearStorage(),
  ]);
  await testEnvironment.cleanup();
});

test("Firestore profiles remain owner-only and cannot be enumerated", async () => {
  await testEnvironment.clearFirestore();
  await seedFirestore([
    ["users/alice", { uid: "alice", displayName: "Alice" }],
    ["users/bob", { uid: "bob", displayName: "Bob" }],
  ]);

  const ownerSnapshot = await assertSucceeds(
    getDoc(doc(auth("alice").firestore(), "users/alice"))
  );
  assert.equal(ownerSnapshot.data().displayName, "Alice");

  await assertFails(getDoc(doc(auth("bob").firestore(), "users/alice")));
  await assertFails(
    getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), "users/alice"))
  );
  await assertFails(getDocs(collection(auth("alice").firestore(), "users")));
});

test("Firestore deletion marker closes profile and notification access", async () => {
  await testEnvironment.clearFirestore();
  await seedFirestore([
    ["users/alice", { uid: "alice", displayName: "Alice" }],
    ["users/bob", { uid: "bob", displayName: "Bob" }],
    [
      "users/alice/notifications/notice-1",
      { text: "Existing notice", type: "new_match", read: false },
    ],
    ["deletingAccounts/alice", { deleting: true }],
  ]);

  const aliceFirestore = auth("alice").firestore();
  const aliceProfile = doc(aliceFirestore, "users/alice");
  const aliceNotification = doc(
    aliceFirestore,
    "users/alice/notifications/notice-1"
  );
  const deletionMarker = doc(aliceFirestore, "deletingAccounts/alice");

  await assertFails(getDoc(aliceProfile));
  await assertFails(updateDoc(aliceProfile, { displayName: "Returned Alice" }));
  await assertFails(getDoc(aliceNotification));
  await assertFails(updateDoc(aliceNotification, { read: true }));
  await assertFails(deleteDoc(aliceNotification));
  await assertFails(getDoc(deletionMarker));
  await assertFails(setDoc(deletionMarker, { deleting: false }));
  await assertFails(deleteDoc(deletionMarker));

  const bobProfile = await assertSucceeds(
    getDoc(doc(auth("bob").firestore(), "users/bob"))
  );
  assert.equal(bobProfile.data().displayName, "Bob");

  await asAdmin((context) =>
    deleteDoc(doc(context.firestore(), "users/alice"))
  );
  await assertFails(
    setDoc(aliceProfile, { uid: "alice", displayName: "Recreated Alice" })
  );
});

test("Firestore deletion marker closes match and chat access for both participants", async () => {
  await testEnvironment.clearFirestore();
  await seedFirestore([
    ["matches/active", matchData({ matched: true })],
    [
      "matches/active/messages/existing-message",
      {
        senderId: "alice",
        text: "already sent",
        mediaURL: null,
        type: "text",
        timestamp: new Date("2025-01-01T00:00:00.000Z"),
        isRead: false,
      },
    ],
    ["matches/active/typingStatus/bob", { typing: true }],
    ["deletingAccounts/alice", { deleting: true }],
  ]);

  for (const uid of ["alice", "bob"]) {
    const firestore = auth(uid).firestore();
    await assertFails(getDoc(doc(firestore, "matches/active")));
    await assertFails(
      getDoc(doc(firestore, "matches/active/messages/existing-message"))
    );
    await assertFails(
      getDoc(doc(firestore, "matches/active/typingStatus/bob"))
    );
    await assertFails(
      setDoc(
        doc(firestore, `matches/active/messages/${uid}-late-message`),
        messageData(uid)
      )
    );
  }

  await assertFails(
    updateDoc(
      doc(auth("bob").firestore(), "matches/active/messages/existing-message"),
      { isRead: true }
    )
  );
  await assertFails(
    deleteDoc(
      doc(auth("bob").firestore(), "matches/active/typingStatus/bob")
    )
  );
});

test("Firestore match and ended-message history are participant-private", async () => {
  await testEnvironment.clearFirestore();
  await seedFirestore([
    [
      "matches/ended",
      { participants: ["alice", "bob"], matched: false },
    ],
    [
      "matches/ended/messages/history-1",
      {
        senderId: "alice",
        text: "old hello",
        mediaURL: null,
        type: "text",
        timestamp: new Date("2025-01-01T00:00:00.000Z"),
        isRead: true,
      },
    ],
  ]);

  const matchSnapshot = await assertSucceeds(
    getDoc(doc(auth("alice").firestore(), "matches/ended"))
  );
  assert.equal(matchSnapshot.data().matched, false);
  await assertFails(
    updateDoc(doc(auth("alice").firestore(), "matches/ended"), {
      likedByA: true,
      matched: true,
    })
  );

  const historySnapshot = await assertSucceeds(
    getDocs(collection(auth("bob").firestore(), "matches/ended/messages"))
  );
  assert.equal(historySnapshot.size, 1);

  await assertFails(getDoc(doc(auth("carol").firestore(), "matches/ended")));
  await assertFails(
    getDocs(collection(auth("carol").firestore(), "matches/ended/messages"))
  );
});

test("Firestore chat creation requires an active match participant", async () => {
  await testEnvironment.clearFirestore();
  await seedFirestore([
    ["matches/active", matchData({ matched: true })],
    ["matches/ended", matchData({ matched: false })],
  ]);

  await assertSucceeds(
    setDoc(
      doc(auth("alice").firestore(), "matches/active/messages/alice-message"),
      messageData()
    )
  );
  await assertFails(
    setDoc(
      doc(auth("alice").firestore(), "matches/ended/messages/late-message"),
      messageData()
    )
  );
  await assertFails(
    setDoc(
      doc(auth("carol").firestore(), "matches/active/messages/outsider-message"),
      messageData("carol")
    )
  );
});

test("Firestore reports deny every direct client operation", async () => {
  await testEnvironment.clearFirestore();
  await seedFirestore([
    ["reports/report-1", { reporterUid: "alice", targetUid: "bob" }],
  ]);

  const report = doc(auth("alice").firestore(), "reports/report-1");
  await assertFails(getDoc(report));
  await assertFails(updateDoc(report, { reason: "updated" }));
  await assertFails(deleteDoc(report));
  await assertFails(
    setDoc(doc(auth("alice").firestore(), "reports/report-2"), {
      reporterUid: "alice",
      targetUid: "bob",
    })
  );
});

test("RTDB presence hides the room parent and exposes only an unblocked projection", async () => {
  await testEnvironment.clearDatabase();
  const now = Date.now();
  const presence = {
    sessionId: BOB_SESSION,
    x: 1,
    z: 2,
    heading: 0,
    speed: 0,
    name: "Bob",
    color: "#4477aa",
    intent: "friends",
    appearance: {
      v: 1,
      frame: "balanced",
      skinTone: "warm-ochre",
      hairStyle: "asymmetric-bob",
      hairColor: "espresso",
      outfit: {
        base: "promenade-v1",
        palette: "garden-glass",
        trim: "minimal",
      },
      accessory: "none",
    },
    lastUpdate: now,
  };

  await seedDatabase({
    presence: {
      [ROOM_ID]: {
        alice: {
          ...presence,
          sessionId: ALICE_SESSION,
          name: "Alice",
          color: "#aa7744",
        },
        bob: presence,
      },
    },
    worldRoomMemberships: {
      [ROOM_ID]: {
        alice: { sessionId: ALICE_SESSION, joinedAt: now },
        bob: { sessionId: BOB_SESSION, joinedAt: now },
      },
    },
    worldPresenceViews: {
      alice: { [ROOM_ID]: { bob: BOB_SESSION } },
    },
  });

  const aliceDatabase = auth("alice").database();
  const roster = await assertSucceeds(
    getDatabaseValue(
      databaseRef(aliceDatabase, `worldPresenceViews/alice/${ROOM_ID}`)
    )
  );
  assert.equal(roster.val().bob, BOB_SESSION);
  await assertFails(
    getDatabaseValue(databaseRef(aliceDatabase, `presence/${ROOM_ID}`))
  );

  const projected = await assertSucceeds(
    getDatabaseValue(databaseRef(aliceDatabase, `presence/${ROOM_ID}/bob`))
  );
  assert.equal(projected.val().sessionId, BOB_SESSION);

  await asAdmin((context) =>
    removeDatabaseValue(
      databaseRef(context.database(), `presence/${ROOM_ID}/alice`)
    )
  );
  await assertFails(
    getDatabaseValue(
      databaseRef(aliceDatabase, `worldPresenceViews/alice/${ROOM_ID}`)
    )
  );
  await assertFails(
    getDatabaseValue(databaseRef(aliceDatabase, `presence/${ROOM_ID}/bob`))
  );
  await asAdmin((context) =>
    setDatabaseValue(
      databaseRef(context.database(), `presence/${ROOM_ID}/alice`),
      {
        ...presence,
        sessionId: ALICE_SESSION,
        name: "Alice",
        color: "#aa7744",
        lastUpdate: Date.now(),
      }
    )
  );

  await asAdmin((context) =>
    setDatabaseValue(
      databaseRef(context.database(), "worldBlockEdges/alice/bob"),
      true
    )
  );
  await assertFails(
    getDatabaseValue(databaseRef(aliceDatabase, `presence/${ROOM_ID}/bob`))
  );

  await asAdmin(async (context) => {
    await removeDatabaseValue(
      databaseRef(context.database(), "worldBlockEdges/alice/bob")
    );
    await setDatabaseValue(
      databaseRef(context.database(), "worldBlockEdges/bob/alice"),
      true
    );
  });
  await assertFails(
    getDatabaseValue(databaseRef(aliceDatabase, `presence/${ROOM_ID}/bob`))
  );
});

test("RTDB station seats require the bounded roster query; leaves remain private", async () => {
  await testEnvironment.clearDatabase();
  const now = Date.now();
  const stationPath = `stations/${ROOM_ID}/chess-table`;
  await seedDatabase({
    stations: {
      [ROOM_ID]: {
        "chess-table": {
          seats: {
            alice: stationSeat("Alice", ALICE_SESSION, now - 3),
            bob: stationSeat("Bob", BOB_SESSION, now - 2),
            carol: stationSeat("Carol", CAROL_SESSION, now - 1),
          },
        },
      },
    },
  });

  const aliceDatabase = auth("alice").database();
  await assertFails(getDatabaseValue(databaseRef(aliceDatabase, stationPath)));
  await assertFails(
    getDatabaseValue(databaseRef(aliceDatabase, `${stationPath}/seats`))
  );

  const roster = await assertSucceeds(
    getDatabaseValue(
      query(
        databaseRef(aliceDatabase, `${stationPath}/seats`),
        orderByChild("sitAt"),
        limitToFirst(2)
      )
    )
  );
  assert.equal(roster.size, 2);

  await assertSucceeds(
    getDatabaseValue(databaseRef(aliceDatabase, `${stationPath}/seats/alice`))
  );
  await assertFails(
    getDatabaseValue(databaseRef(aliceDatabase, `${stationPath}/seats/bob`))
  );
});

test("RTDB station match reads require a current participant seat and no block", async () => {
  await testEnvironment.clearDatabase();
  const now = Date.now();
  const matchPath = `stations/${ROOM_ID}/chess-table/match`;
  await seedDatabase({
    stations: {
      [ROOM_ID]: {
        "chess-table": {
          seats: {
            alice: stationSeat("Alice", ALICE_SESSION, now - 3),
            bob: stationSeat("Bob", BOB_SESSION, now - 2),
            carol: stationSeat("Carol", CAROL_SESSION, now - 1),
          },
          match: stationMatch(),
        },
      },
    },
  });

  const aliceMatch = databaseRef(auth("alice").database(), matchPath);
  const participantSnapshot = await assertSucceeds(
    getDatabaseValue(aliceMatch)
  );
  assert.equal(participantSnapshot.val().white, "alice");

  await assertFails(
    getDatabaseValue(databaseRef(auth("carol").database(), matchPath))
  );

  await asAdmin((context) =>
    setDatabaseValue(
      databaseRef(
        context.database(),
        `stations/${ROOM_ID}/chess-table/seats/alice/sessionId`
      ),
      CAROL_SESSION
    )
  );
  await assertFails(getDatabaseValue(aliceMatch));

  await asAdmin(async (context) => {
    await setDatabaseValue(
      databaseRef(
        context.database(),
        `stations/${ROOM_ID}/chess-table/seats/alice/sessionId`
      ),
      ALICE_SESSION
    );
    await setDatabaseValue(
      databaseRef(context.database(), "worldBlockEdges/alice/bob"),
      true
    );
  });
  await assertFails(getDatabaseValue(aliceMatch));

  await asAdmin(async (context) => {
    await removeDatabaseValue(
      databaseRef(context.database(), "worldBlockEdges/alice/bob")
    );
    await setDatabaseValue(
      databaseRef(context.database(), "worldBlockEdges/bob/alice"),
      true
    );
  });
  await assertFails(getDatabaseValue(aliceMatch));
});

test("RTDB station chess permits creation and teardown but denies client game-state writes", async () => {
  await testEnvironment.clearDatabase();
  const stationPath = `stations/${ROOM_ID}/chess-table`;
  await seedDatabase({
    stations: {
      [ROOM_ID]: {
        "chess-table": {
          seats: {
            alice: stationSeat("Alice", ALICE_SESSION, Date.now() - 2),
            bob: stationSeat("Bob", BOB_SESSION, Date.now() - 1),
          },
        },
      },
    },
  });

  const aliceDatabase = auth("alice").database();
  const matchPath = `${stationPath}/match`;
  const initial = stationMatch();
  await assertSucceeds(
    setDatabaseValue(databaseRef(aliceDatabase, matchPath), initial)
  );
  await assertFails(
    setDatabaseValue(
      databaseRef(aliceDatabase, `${matchPath}/moves/m001`),
      {
        actionId: "chess:0000000000000001",
        san: "e4",
        by: "alice",
        at: Date.now(),
        ply: 1,
      }
    )
  );
  await assertFails(
    setDatabaseValue(
      databaseRef(aliceDatabase, `${matchPath}/fen`),
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    )
  );
  await assertFails(
    setDatabaseValue(
      databaseRef(aliceDatabase, `${matchPath}/result`),
      "white"
    )
  );
  await assertSucceeds(
    removeDatabaseValue(databaseRef(aliceDatabase, matchPath))
  );
});

test("RTDB permits a seated candidate to observe an absent station match", async () => {
  await testEnvironment.clearDatabase();
  const stationPath = `stations/${ROOM_ID}/listening-crescent`;
  await seedDatabase({
    stations: {
      [ROOM_ID]: {
        "listening-crescent": {
          seats: {
            alice: stationSeat("Alice", ALICE_SESSION, Date.now()),
          },
        },
      },
    },
  });

  const snapshot = await assertSucceeds(
    getDatabaseValue(
      databaseRef(auth("alice").database(), `${stationPath}/match`)
    )
  );
  assert.equal(snapshot.exists(), false);

  await assertFails(
    getDatabaseValue(
      databaseRef(auth("bob").database(), `${stationPath}/match`)
    )
  );
});

test("Storage chat uploads require an active match participant", async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();
  await seedFirestore([
    ["matches/active", matchData({ matched: true })],
    ["matches/ended", matchData({ matched: false })],
  ]);

  const bytes = new Uint8Array([137, 80, 78, 71]);
  const pendingPath = "chatMedia/active/alice/pending-message/alice.png";
  await assertSucceeds(
    uploadBytes(
      storageRef(auth("alice").storage(), pendingPath),
      bytes,
      { contentType: "image/png" }
    )
  );
  await assertFails(
    listAll(storageRef(auth("alice").storage(), "chatMedia/active"))
  );
  await assertSucceeds(
    deleteObject(storageRef(auth("alice").storage(), pendingPath))
  );

  const sentPath = "chatMedia/active/alice/sent-message/alice.png";
  await assertSucceeds(
    uploadBytes(storageRef(auth("alice").storage(), sentPath), bytes, {
      contentType: "image/png",
    })
  );
  await assertSucceeds(
    setDoc(
      doc(auth("alice").firestore(), "matches/active/messages/sent-message"),
      messageData()
    )
  );
  await assertFails(
    deleteObject(storageRef(auth("alice").storage(), sentPath))
  );
  await assertFails(
    uploadBytes(
      storageRef(
        auth("alice").storage(),
        "chatMedia/ended/alice/late-message/late.png"
      ),
      bytes,
      { contentType: "image/png" }
    )
  );
  await assertFails(
    uploadBytes(
      storageRef(
        auth("carol").storage(),
        "chatMedia/active/carol/outsider-message/outsider.png"
      ),
      bytes,
      { contentType: "image/png" }
    )
  );
});

test("Storage deletion marker denies new uploads and preserves orphan cleanup", async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();
  await seedFirestore([["matches/active", matchData({ matched: true })]]);

  const aliceStorage = auth("alice").storage();
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const pendingPath = "chatMedia/active/alice/pending-delete/alice.png";
  await assertSucceeds(
    uploadBytes(storageRef(aliceStorage, pendingPath), bytes, {
      contentType: "image/png",
    })
  );

  await seedFirestore([["deletingAccounts/alice", { deleting: true }]]);

  await assertFails(
    uploadBytes(
      storageRef(aliceStorage, "userMedia/alice/post-marker.png"),
      bytes,
      { contentType: "image/png" }
    )
  );
  await assertFails(
    uploadBytes(
      storageRef(
        aliceStorage,
        "chatMedia/active/alice/post-marker/alice.png"
      ),
      bytes,
      { contentType: "image/png" }
    )
  );
  await assertSucceeds(
    deleteObject(storageRef(aliceStorage, pendingPath))
  );
});

test("Storage denies chat upload when the other participant is deleting", async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();
  await seedFirestore([
    ["matches/active", matchData({ matched: true })],
    ["deletingAccounts/bob", { deleting: true }],
  ]);

  await assertFails(
    uploadBytes(
      storageRef(
        auth("alice").storage(),
        "chatMedia/active/alice/peer-deleting/alice.png"
      ),
      new Uint8Array([137, 80, 78, 71]),
      { contentType: "image/png" }
    )
  );
});

test("Storage profile directories cannot be listed, including by the owner", async () => {
  await assertFails(
    listAll(storageRef(auth("alice").storage(), "userMedia/alice"))
  );
  await assertFails(
    listAll(storageRef(auth("bob").storage(), "userMedia/alice"))
  );
});
