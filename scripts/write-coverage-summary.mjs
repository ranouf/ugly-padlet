import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coveragePath = path.join(
  root,
  "coverage",
  "jest",
  "coverage-summary.json",
);
const outputPath = path.join(root, "coverage", "jest", "coverage-summary.md");
const threshold = 90;

const coverage = JSON.parse(await readFile(coveragePath, "utf8"));
const rows = [
  ["Line", coverage.total.lines.pct],
  ["Branch", coverage.total.branches.pct],
  ["Function", coverage.total.functions.pct],
  ["Statement", coverage.total.statements.pct],
];

const markdown = [
  "## Code Coverage",
  "",
  "| Coverage Type | Threshold | Actual Coverage | Status |",
  "| --- | ---: | ---: | --- |",
  ...rows.map(([label, actual]) => {
    const status = actual >= threshold ? "PASSED" : "FAILED";
    return `| ${label} | ${threshold}% | ${actual}% | ${status} |`;
  }),
  "",
  "<details>",
  "<summary>Code Coverage Details</summary>",
  "",
  "```json",
  JSON.stringify(coverage.total, null, 2),
  "```",
  "",
  "</details>",
  "",
].join("\n");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, markdown, "utf8");

if (process.env["GITHUB_OUTPUT"]) {
  await writeFile(
    process.env["GITHUB_OUTPUT"],
    [
      `line=${coverage.total.lines.pct}`,
      `branch=${coverage.total.branches.pct}`,
      `function=${coverage.total.functions.pct}`,
      `statement=${coverage.total.statements.pct}`,
      `threshold=${threshold}`,
      `summary<<COVERAGE_SUMMARY`,
      markdown,
      `COVERAGE_SUMMARY`,
      "",
    ].join("\n"),
    { flag: "a" },
  );
}

if (process.env["GITHUB_STEP_SUMMARY"]) {
  await writeFile(process.env["GITHUB_STEP_SUMMARY"], `${markdown}\n`, {
    flag: "a",
  });
}

console.log(markdown);
