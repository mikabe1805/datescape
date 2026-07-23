const fs = require("node:fs");
const path = require("node:path");

const srcRoot = path.resolve(__dirname, "..");
const mainAppSource = fs.readFileSync(
  path.join(srcRoot, "MainApp.js"),
  "utf8",
);
const signupSource = fs.readFileSync(
  path.join(srcRoot, "components", "MultiStepSignup.js"),
  "utf8",
);

describe("first-world onboarding authority", () => {
  it("routes completed and fallback sessions into the world", () => {
    expect(signupSource).toContain('navigate("/app/explore")');
    expect(mainAppSource).toContain(
      '<Route path="explore" element={<WorldPage />} />',
    );
    expect(mainAppSource).toContain(
      '<Route path="*" element={<Navigate to="explore" replace />} />',
    );
  });

  it("does not mount a delayed app-shell tour over Arrival", () => {
    expect(mainAppSource).not.toContain("FirstLaunchTour");
    expect(signupSource).not.toContain("justSignedUp");
  });
});
