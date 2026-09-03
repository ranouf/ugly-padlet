const path = require("path");
const {
  contentScriptFiles,
  readManifest,
  readPackageJson,
  usesOnlyLocalScripts,
} = require("../../scripts/extension-metadata.cjs");

const root = path.resolve(__dirname, "..", "..");

describe("Chrome extension package metadata", () => {
  test("manifest and package versions stay aligned", () => {
    const manifest = readManifest(root);
    const packageJson = readPackageJson(root);

    expect(packageJson.version).toBe(manifest.version);
  });

  test("manifest declares only package-local scripts", () => {
    const manifest = readManifest(root);
    const scripts = contentScriptFiles(manifest);

    expect(scripts).toContain("vendor/hammer.min.js");
    expect(scripts).toContain("content.js");
    expect(usesOnlyLocalScripts(manifest)).toBe(true);
  });

  test("remote content scripts are rejected by metadata validation", () => {
    expect(
      usesOnlyLocalScripts({
        content_scripts: [{ js: ["https://cdn.example.com/remote.js"] }],
      }),
    ).toBe(false);
  });

  test("content script entries without js files are handled", () => {
    expect(contentScriptFiles({ content_scripts: [{}] })).toEqual([]);
  });
});
