import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZipFile } from "yazl";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8"),
);
const version = manifest.version;
const distRoot = path.join(root, "dist");
const packageDir = path.join(distRoot, `uglypadlet-${version}`);
const zipPath = path.join(distRoot, `uglypadlet-${version}-chrome-store.zip`);
const packageEntries = [
  "manifest.json",
  "content.js",
  "styles.css",
  "icons",
  "vendor",
];

await rm(packageDir, { recursive: true, force: true });
await mkdir(packageDir, { recursive: true });

for (const entry of packageEntries) {
  await copyEntry(path.join(root, entry), path.join(packageDir, entry));
}

await zipDirectory(packageDir, zipPath);

console.log(
  `Chrome extension package created: ${path.relative(root, zipPath)}`,
);

/**
 * @param {string} source
 * @param {string} destination
 */
async function copyEntry(source, destination) {
  const info = await stat(source);
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    const children = await readdir(source);
    await Promise.all(
      children.map((child) =>
        copyEntry(path.join(source, child), path.join(destination, child)),
      ),
    );
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

/**
 * @param {string} sourceDir
 * @param {string} destination
 */
async function zipDirectory(sourceDir, destination) {
  await mkdir(path.dirname(destination), { recursive: true });

  const zipFile = new ZipFile();
  const output = createWriteStream(destination);
  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    zipFile.outputStream.on("error", reject);
  });

  await addDirectoryToZip(zipFile, sourceDir, "");
  zipFile.end();
  zipFile.outputStream.pipe(output);
  await done;
}

/**
 * @param {any} zipFile
 * @param {string} directory
 * @param {string} prefix
 */
async function addDirectoryToZip(zipFile, directory, prefix) {
  const entries = await readdir(directory);

  for (const entry of entries) {
    const source = path.join(directory, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    const info = await stat(source);
    if (info.isDirectory()) {
      await addDirectoryToZip(zipFile, source, relative);
    } else {
      zipFile.addFile(source, relative);
    }
  }
}
