const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("../node_modules/typescript");

function loadActivityAnchors() {
  const sourcePath = path.resolve(__dirname, "../src/activityAnchors.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  });
  assert.equal(
    output.diagnostics?.length || 0,
    0,
    "activityAnchors.ts should transpile for its isolated contract test",
  );
  const module = { exports: {} };
  vm.runInNewContext(output.outputText, { exports: module.exports, module }, {
    filename: "activityAnchors.compiled.cjs",
  });
  return module.exports;
}

test("Listening Crescent selects only the nearest remote at the opposite authored seat", () => {
  const { ACTIVITY_ANCHORS, selectListeningPartner } = loadActivityAnchors();
  const activity = {
    id: "listening-crescent",
    active: true,
    slot: 0,
    phase: "playing",
  };
  const partnerSeat = ACTIVITY_ANCHORS["listening-crescent"][1];
  const localSeat = ACTIVITY_ANCHORS["listening-crescent"][0];
  const candidates = new Map([
    ["remote-nearer", { x: partnerSeat.x + 0.18, z: partnerSeat.z - 0.12 }],
    ["remote-nearby", { x: partnerSeat.x - 0.45, z: partnerSeat.z + 0.2 }],
    ["remote-local-seat", { x: localSeat.x, z: localSeat.z }],
    ["remote-outside", { x: -7, z: 6.3 }],
  ]);

  const selected = selectListeningPartner(
    activity,
    candidates,
    (candidate) => candidate,
  );
  assert.equal(selected.uid, "remote-nearer");
  assert.deepEqual(selected.anchor, partnerSeat);
});

test("Listening Crescent resolves equidistant candidates with a stable UID tie-break", () => {
  const { ACTIVITY_ANCHORS, selectListeningPartner } = loadActivityAnchors();
  const activity = {
    id: "listening-crescent",
    active: true,
    slot: 1,
    phase: "waiting",
  };
  const partnerSeat = ACTIVITY_ANCHORS["listening-crescent"][0];
  const candidates = new Map([
    ["remote-z", { x: partnerSeat.x + 0.25, z: partnerSeat.z }],
    ["remote-a", { x: partnerSeat.x - 0.25, z: partnerSeat.z }],
  ]);

  assert.equal(
    selectListeningPartner(activity, candidates, (candidate) => candidate).uid,
    "remote-a",
  );
});

test("non-listening activity states never place a remote avatar in the seated pose", () => {
  const { selectListeningPartner } = loadActivityAnchors();
  const candidates = new Map([
    ["remote-a", { x: -4.684, z: 6.289 }],
  ]);
  assert.equal(
    selectListeningPartner(null, candidates, (candidate) => candidate),
    null,
  );
  assert.equal(
    selectListeningPartner(
      {
        id: "resonance-duet",
        active: true,
        slot: 0,
        phase: "playing",
      },
      candidates,
      (candidate) => candidate,
    ),
    null,
  );
});

test("renderer reuses the authored seated animation for the remote partner", () => {
  const worldSource = fs.readFileSync(
    path.resolve(__dirname, "../src/moodStudy.ts"),
    "utf8",
  );
  assert.match(worldSource, /const listeningPartner = selectListeningPartner\(/);
  assert.match(worldSource, /remoteEntities\.forEach\(\(entry, uid\) =>/);
  assert.match(worldSource, /uid === listeningPartner\?\.uid/);
  assert.match(worldSource, /entry\.pose = listeningAnchor \? "listening" : null/);
  assert.match(worldSource, /const listeningClip = entry\.authoredClips\.has\("AV_Listen_Seat"\)/);
  assert.match(worldSource, /const targetHeading = listeningAnchor\?\.heading/);
});
