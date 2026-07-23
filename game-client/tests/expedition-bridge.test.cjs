const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("../node_modules/typescript");

function loadBridge() {
  const sourcePath = path.resolve(__dirname, "../src/bridge.ts");
  const source = fs
    .readFileSync(sourcePath, "utf8")
    .replace("import.meta.env.VITE_SHELL_ORIGIN", "undefined");
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
    "bridge.ts should transpile for its isolated contract test",
  );

  const parent = { postMessage() {} };
  let messageHandler = null;
  const window = {
    parent,
    location: { origin: "https://game.datescape.test" },
    addEventListener(type, handler) {
      if (type === "message") messageHandler = handler;
    },
    removeEventListener(type, handler) {
      if (type === "message" && messageHandler === handler) messageHandler = null;
    },
  };
  const module = { exports: {} };
  const context = {
    URL,
    console,
    document: { referrer: "https://shell.datescape.test/world" },
    exports: module.exports,
    module,
    require,
    Set,
    window,
  };
  vm.runInNewContext(output.outputText, context, {
    filename: "bridge.compiled.cjs",
  });
  return {
    bridge: module.exports,
    dispatch(payload) {
      assert.ok(messageHandler, "WorldBridge should register a message listener");
      messageHandler({
        source: parent,
        origin: "https://shell.datescape.test",
        data: {
          scope: "datescape-world",
          version: 2,
          type: "EXPEDITION_STATE",
          payload,
        },
      });
    },
  };
}

function activeExpedition(overrides = {}) {
  return {
    id: "lanternkeeper-expedition",
    instanceId: "expedition:summer-001",
    revision: 7,
    status: "active",
    stageId: "market-lanterns",
    memberCount: 2,
    maxMembers: 4,
    expiresAt: 1_800_000_000_000,
    echoAvailableAt: 1_799_999_970_000,
    resultMode: null,
    completedTargetIds: ["conservatory-scan", "market-west"],
    personal: {
      joined: true,
      completedTargetIds: ["conservatory-scan"],
      availableTargetIds: ["market-east"],
      canUseEcho: false,
    },
    serverNow: 1_799_999_900_000,
    ...overrides,
  };
}

test("accepts strict idle, active, and completed Expedition projections", () => {
  const { bridge } = loadBridge();
  assert.equal(bridge.isExpeditionState(activeExpedition()), true);
  assert.equal(
    bridge.isExpeditionState({
      ...activeExpedition(),
      status: "forming",
      stageId: "conservatory-scan",
      memberCount: 1,
      completedTargetIds: [],
      personal: {
        joined: true,
        completedTargetIds: [],
        availableTargetIds: ["conservatory-scan"],
        canUseEcho: false,
      },
    }),
    true,
  );
  assert.equal(
    bridge.isExpeditionState({
      ...activeExpedition(),
      instanceId: null,
      revision: 0,
      status: "idle",
      stageId: null,
      memberCount: 0,
      expiresAt: null,
      echoAvailableAt: null,
      completedTargetIds: [],
      personal: {
        joined: false,
        completedTargetIds: [],
        availableTargetIds: [],
        canUseEcho: false,
      },
    }),
    true,
  );
  assert.equal(
    bridge.isExpeditionState({
      ...activeExpedition(),
      revision: 12,
      status: "completed",
      stageId: "complete",
      expiresAt: null,
      resultMode: "echo",
      completedTargetIds: [
        "conservatory-scan",
        "market-west",
        "market-east",
        "resonance-left",
        "resonance-right",
      ],
      personal: {
        joined: true,
        completedTargetIds: [
          "conservatory-scan",
          "market-west",
          "resonance-left",
        ],
        availableTargetIds: [],
        canUseEcho: false,
      },
    }),
    true,
  );
});

test("rejects malformed, over-shared, or incoherent Expedition projections", () => {
  const { bridge } = loadBridge();
  const cases = [
    { ...activeExpedition(), extraPrivateField: "uid" },
    { ...activeExpedition(), instanceId: "unsafe instance" },
    { ...activeExpedition(), revision: -1 },
    { ...activeExpedition(), memberCount: 5 },
    {
      ...activeExpedition(),
      completedTargetIds: ["market-west", "market-west"],
    },
    {
      ...activeExpedition(),
      completedTargetIds: ["market-west"],
      personal: {
        joined: true,
        completedTargetIds: ["market-east"],
        availableTargetIds: [],
        canUseEcho: false,
      },
    },
    {
      ...activeExpedition(),
      personal: {
        joined: false,
        completedTargetIds: [],
        availableTargetIds: [],
        canUseEcho: true,
      },
    },
    { ...activeExpedition(), resultMode: "standard" },
    {
      ...activeExpedition(),
      status: "completed",
      stageId: "resonance-chime",
      resultMode: "standard",
    },
    {
      ...activeExpedition(),
      personal: {
        ...activeExpedition().personal,
        availableTargetIds: ["resonance-left"],
      },
    },
    {
      ...activeExpedition(),
      personal: {
        ...activeExpedition().personal,
        uid: "private-user-id",
      },
    },
  ];
  cases.forEach((value) => assert.equal(bridge.isExpeditionState(value), false));
});

test("WorldBridge emits a defensive Expedition projection only for trusted envelopes", () => {
  const harness = loadBridge();
  const worldBridge = new harness.bridge.WorldBridge();
  const received = [];
  worldBridge.onExpedition((state) => received.push(state));

  const payload = activeExpedition();
  harness.dispatch(payload);
  assert.equal(received.length, 1);
  assert.notEqual(received[0], payload);
  assert.notEqual(received[0].completedTargetIds, payload.completedTargetIds);
  assert.notEqual(received[0].personal, payload.personal);
  assert.notEqual(
    received[0].personal.completedTargetIds,
    payload.personal.completedTargetIds,
  );
  assert.notEqual(
    received[0].personal.availableTargetIds,
    payload.personal.availableTargetIds,
  );

  payload.completedTargetIds.push("market-east");
  payload.personal.completedTargetIds.push("market-west");
  payload.personal.availableTargetIds.push("resonance-left");
  assert.deepEqual(Array.from(received[0].completedTargetIds), [
    "conservatory-scan",
    "market-west",
  ]);
  assert.deepEqual(Array.from(received[0].personal.completedTargetIds), [
    "conservatory-scan",
  ]);
  assert.deepEqual(Array.from(received[0].personal.availableTargetIds), [
    "market-east",
  ]);

  harness.dispatch({ ...activeExpedition(), unexpected: true });
  assert.equal(received.length, 1);
  worldBridge.destroy();
});
