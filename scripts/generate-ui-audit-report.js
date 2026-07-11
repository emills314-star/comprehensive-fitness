const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const artifactDir = path.join(root, "artifacts", "ui-audit");
const resultPath = path.join(artifactDir, "results.json");
const results = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, "utf8")) : null;
const tests = results?.suites?.flatMap((suite) => suite.specs || []) || [];
const failed = tests.filter((spec) => !spec.ok);
const skipped = tests.filter((spec) => spec.tests?.some((entry) => entry.status === "skipped"));
const gitMetadata = () => {
  const gitDir = path.join(root, ".git");
  try {
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return { branch: "detached", commit: head.slice(0, 7) };
    const ref = head.slice(5);
    const branch = ref.split("/").pop();
    const looseRef = path.join(gitDir, ...ref.split("/"));
    let commit = fs.existsSync(looseRef) ? fs.readFileSync(looseRef, "utf8").trim() : "";
    if (!commit) {
      const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      commit = packed.split(/\r?\n/).find((line) => line.endsWith(` ${ref}`))?.split(" ")[0] || "unknown";
    }
    return { branch, commit: commit.slice(0, 7) };
  } catch {
    return { branch: process.env.GITHUB_REF_NAME || "unknown", commit: (process.env.GITHUB_SHA || "unknown").slice(0, 7) };
  }
};
const revision = gitMetadata();
const date = new Date().toISOString();
const status = !results ? "FAILURE" : failed.length ? "FAILURE" : skipped.length ? "WARNING" : "PASS";
const report = `# Weekly UI/UX audit report

- Audit time: ${date}
- Commit: ${revision.commit}
- Branch: ${revision.branch}
- Status: **${status}**
- Screens/workflows: Workout, Dashboard, Templates, Charts, Settings; light theme; mobile and desktop viewports
- Tests: route rendering, active navigation, horizontal overflow, clipped controls, WCAG A/AA axe checks, console errors, visual snapshots, source-style ceilings, documentation contract
- Visual regressions: ${failed.filter((item) => item.title.includes("visually stable")).map((item) => item.title).join(", ") || "None detected"}
- Accessibility issues: ${failed.filter((item) => item.title.includes("accessible")).map((item) => item.title).join(", ") || "None detected"}
- Documentation mismatches: ${failed.filter((item) => item.title.includes("documentation")).map((item) => item.title).join(", ") || "None detected"}
- Automatically corrected: None; the audit detects and reports changes but never approves unexplained visual differences
- Files changed by audit: None
- Screenshots/diffs: \`artifacts/ui-audit/test-results/\` and \`artifacts/ui-audit/html/\`
- Issues requiring review: ${failed.map((item) => item.title).join(", ") || "None"}
- Tests that could not run: ${skipped.map((item) => item.title).join(", ") || "None"}
- Incomplete coverage: native safe areas, physical-device keyboard overlap, screen readers, haptics, push permission/system UI, and data-heavy edge fixtures require device or expanded fixture coverage

${!results ? "The Playwright result file was missing; this failure could hide UI regressions." : "The audit result file was produced successfully."}
`;
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, "weekly-report.md"), report);
console.log(report);
if (status === "FAILURE") process.exitCode = 1;
