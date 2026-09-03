const fs = require("fs");
const path = require("path");

function readJson(root, fileName) {
  return JSON.parse(fs.readFileSync(path.join(root, fileName), "utf8"));
}

function readManifest(root) {
  return readJson(root, "manifest.json");
}

function readPackageJson(root) {
  return readJson(root, "package.json");
}

function contentScriptFiles(manifest) {
  return manifest.content_scripts.flatMap((script) => script.js || []);
}

function usesOnlyLocalScripts(manifest) {
  return contentScriptFiles(manifest).every(
    (script) => !/^https?:\/\//i.test(script),
  );
}

module.exports = {
  contentScriptFiles,
  readManifest,
  readPackageJson,
  usesOnlyLocalScripts,
};
