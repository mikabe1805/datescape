const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("../node_modules/typescript");

function loadAudioGesturePolicy() {
  const sourcePath = path.resolve(__dirname, "../src/audioGesture.ts");
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
    "audioGesture.ts should transpile for its isolated policy test",
  );
  const module = { exports: {} };
  vm.runInNewContext(output.outputText, { exports: module.exports, module }, {
    filename: "audioGesture.compiled.cjs",
  });
  return module.exports;
}

function keyboardGesture(code, overrides = {}) {
  return {
    code,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
  };
}

test("only deliberate world-control keys may unlock the soundscape", () => {
  const { isGameplayAudioUnlockKey } = loadAudioGesturePolicy();
  ["KeyW", "ArrowLeft", "KeyE", "KeyQ", "KeyT", "Escape"].forEach(
    (code) => assert.equal(isGameplayAudioUnlockKey(keyboardGesture(code)), true),
  );
});

test("focus navigation and modified shortcuts remain silent", () => {
  const { isGameplayAudioUnlockKey } = loadAudioGesturePolicy();
  ["Tab", "ShiftLeft", "Enter", "Space"].forEach((code) =>
    assert.equal(isGameplayAudioUnlockKey(keyboardGesture(code)), false),
  );
  assert.equal(
    isGameplayAudioUnlockKey(keyboardGesture("KeyW", { repeat: true })),
    false,
  );
  assert.equal(
    isGameplayAudioUnlockKey(keyboardGesture("KeyW", { ctrlKey: true })),
    false,
  );
  assert.equal(
    isGameplayAudioUnlockKey(keyboardGesture("KeyW", { metaKey: true })),
    false,
  );
  assert.equal(
    isGameplayAudioUnlockKey(keyboardGesture("KeyW", { altKey: true })),
    false,
  );
});

test("renderer gates keyboard audio startup through the accessibility policy", () => {
  const mainSource = fs.readFileSync(
    path.resolve(__dirname, "../src/main.ts"),
    "utf8",
  );
  assert.match(
    mainSource,
    /event instanceof KeyboardEvent && !isGameplayAudioUnlockKey\(event\)/,
  );
  assert.match(mainSource, /soundscape\.beginFromGesture\(\)/);
  assert.match(
    mainSource,
    /window\.addEventListener\("keydown", onTrustedAudioGesture, true\)/,
  );
});
