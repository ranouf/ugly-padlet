import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8"),
);
const version = manifest.version;
const releaseNotePath = path.join(root, "release-notes", `v${version}.md`);

try {
  await access(releaseNotePath);
} catch {
  console.error(`Missing release note: release-notes/v${version}.md`);
  process.exit(1);
}

const releaseNote = await readFile(releaseNotePath, "utf8");
const requiredSections = [
  "## Summary",
  "## Changes",
  "## Validation",
  "## Screenshots",
];
const missingSections = requiredSections.filter(
  (section) => !releaseNote.includes(section),
);

if (missingSections.length) {
  console.error(
    `Release note ${path.relative(root, releaseNotePath)} is missing: ${missingSections.join(", ")}`,
  );
  process.exit(1);
}

console.log(`Release note found: release-notes/v${version}.md`);
