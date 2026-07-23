const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("../node_modules/typescript");

function loadAdaptiveResolution() {
  const sourcePath = path.resolve(__dirname, "../src/adaptiveResolution.ts");
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
    "adaptiveResolution.ts should transpile for its isolated policy test",
  );
  const module = { exports: {} };
  vm.runInNewContext(output.outputText, { exports: module.exports, module }, {
    filename: "adaptiveResolution.compiled.cjs",
  });
  return module.exports;
}

function sampleRepeatedly(policy, state, fps, count) {
  let next = state;
  for (let index = 0; index < count; index += 1) {
    next = policy.sampleAdaptiveResolution(next, fps);
  }
  return next;
}

test("adaptive resolution starts at a conservative device-pixel-ratio cap", () => {
  const policy = loadAdaptiveResolution();
  assert.equal(policy.createAdaptiveResolutionState(3).pixelRatio, 1.25);
  assert.equal(policy.createAdaptiveResolutionState(1).pixelRatio, 1);
  assert.equal(policy.createAdaptiveResolutionState(Number.NaN).pixelRatio, 1);
});

test("resolution lowers only after three consecutive low-FPS samples", () => {
  const policy = loadAdaptiveResolution();
  const initial = policy.createAdaptiveResolutionState(2);
  const twoLowSamples = sampleRepeatedly(policy, initial, 35, 2);
  assert.equal(twoLowSamples.pixelRatio, 1.25);
  assert.equal(twoLowSamples.lowFpsSamples, 2);

  const lowered = policy.sampleAdaptiveResolution(twoLowSamples, 35);
  assert.equal(lowered.pixelRatio, 1.125);
  assert.equal(lowered.lowFpsSamples, 0);
});

test("a neutral sample breaks a low-FPS streak", () => {
  const policy = loadAdaptiveResolution();
  const initial = policy.createAdaptiveResolutionState(2);
  const oneLowSample = policy.sampleAdaptiveResolution(initial, 35);
  const neutral = policy.sampleAdaptiveResolution(oneLowSample, 50);
  const twoMoreLowSamples = sampleRepeatedly(policy, neutral, 35, 2);
  assert.equal(twoMoreLowSamples.pixelRatio, initial.pixelRatio);
  assert.equal(twoMoreLowSamples.lowFpsSamples, 2);
});

test("a visibility interruption clears partial sample streaks", () => {
  const policy = loadAdaptiveResolution();
  const initial = policy.createAdaptiveResolutionState(2);
  const twoLowSamples = sampleRepeatedly(policy, initial, 35, 2);
  const reset = policy.resetAdaptiveResolutionSamples(twoLowSamples);
  assert.equal(reset.pixelRatio, initial.pixelRatio);
  assert.equal(reset.lowFpsSamples, 0);
  assert.equal(reset.highFpsSamples, 0);
});

test("resolution recovers one step only after six high-FPS samples", () => {
  const policy = loadAdaptiveResolution();
  const initial = policy.createAdaptiveResolutionState(2);
  const lowered = sampleRepeatedly(policy, initial, 35, 3);
  const fiveHighSamples = sampleRepeatedly(policy, lowered, 60, 5);
  assert.equal(fiveHighSamples.pixelRatio, 1.125);
  assert.equal(fiveHighSamples.highFpsSamples, 5);

  const recovered = policy.sampleAdaptiveResolution(fiveHighSamples, 60);
  assert.equal(recovered.pixelRatio, 1.25);
  assert.equal(recovered.highFpsSamples, 0);
});

test("resolution never falls below its floor", () => {
  const policy = loadAdaptiveResolution();
  const initial = policy.createAdaptiveResolutionState(2);
  const sustainedPressure = sampleRepeatedly(policy, initial, 20, 30);
  assert.equal(sustainedPressure.pixelRatio, 0.75);
  assert.equal(sustainedPressure.lowFpsSamples, 0);
});

test("renderer applies policy changes through maxPixelRatio at the existing sample cadence", () => {
  const mainSource = fs.readFileSync(
    path.resolve(__dirname, "../src/main.ts"),
    "utf8",
  );
  assert.match(mainSource, /performanceAccumulator >= 5/);
  assert.match(mainSource, /sampleAdaptiveResolution\(/);
  assert.match(
    mainSource,
    /app\.graphicsDevice\.maxPixelRatio =\s*nextAdaptiveResolution\.pixelRatio/,
  );
  assert.match(mainSource, /app\.resizeCanvas\(\)/);
  assert.match(mainSource, /bridge\.send\("PERFORMANCE_SAMPLE"/);
  assert.match(
    mainSource,
    /document\.hidden[\s\S]{0,180}resetAdaptiveResolutionSamples/,
  );
});
