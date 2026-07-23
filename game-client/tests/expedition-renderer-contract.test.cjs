const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mainSource = fs.readFileSync(
  path.resolve(__dirname, "../src/main.ts"),
  "utf8",
);
const worldSource = fs.readFileSync(
  path.resolve(__dirname, "../src/moodStudy.ts"),
  "utf8",
);

test("renderer locks the five Expedition targets to their authored world coordinates", () => {
  const targets = [
    ["conservatory-scan", "0", "25"],
    ["market-west", "-3.8", "3.5"],
    ["market-east", "3.8", "3.5"],
    ["resonance-left", "-6.4", "-14"],
    ["resonance-right", "-3.2", "-14"],
  ];
  targets.forEach(([id, x, z]) => {
    assert.match(
      mainSource,
      new RegExp(`id: "${id}"[\\s\\S]{0,180}x: ${x.replace(".", "\\.")},[\\s\\S]{0,50}z: ${z.replace(".", "\\.")},`),
    );
    assert.match(worldSource, new RegExp(`id: "${id}"`));
  });
});

test("renderer uses contextual Expedition messages without entering activity lock", () => {
  assert.match(mainSource, /bridge\.send\("ACTION_REQUESTED", \{\s*action: "expedition-contribute"/);
  assert.match(mainSource, /kind: "expedition",\s*instanceId: expeditionState\.instanceId,\s*targetId: nearbyExpeditionTarget\.id/);
  assert.match(mainSource, /"EXPEDITION_TARGET_CHANGED"/);
  assert.match(mainSource, /\{ instanceId: null, targetId: null \}/);
  assert.match(mainSource, /const EXPEDITION_INTERACTION_RADIUS = 2\.8/);
  assert.match(
    mainSource,
    /personal\.availableTargetIds\.includes\(target\.id\)/,
  );
  assert.match(
    worldSource,
    /personal\.availableTargetIds\.includes\(target\.id\)/,
  );
  assert.doesNotMatch(
    mainSource,
    /bridge\.onExpedition[\s\S]{0,700}activeActivity\s*=/,
  );
});

test("world exposes stage-aware Expedition presentation and Lanternkeeper charm", () => {
  assert.match(mainSource, /"lanternkeeper-expedition-v2"/);
  assert.match(worldSource, /setExpeditionState: \(expedition: ExpeditionState\) => void/);
  assert.match(worldSource, /setExpeditionState\(expedition\)/);
  assert.match(worldSource, /expeditionState\.personal\.canUseEcho|state\.personal\.canUseEcho/);
  assert.match(worldSource, /expeditionCelebration = 5/);
  assert.match(worldSource, /prefers-reduced-motion: reduce/);
  assert.match(worldSource, /appearance\.accessory === "lanternkeeper-charm"/);
});
