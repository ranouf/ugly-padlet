const { chromium } = require("@playwright/test");

const PADLET_URL =
  "https://padlet.com/elanquoideneuf/ecole-elan-2025-2026-gsult4hljk84tu3a";

function findArrays(value, path = "$", result = []) {
  if (!value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    result.push({
      path,
      length: value.length,
      sampleKeys:
        value[0] && typeof value[0] === "object"
          ? Object.keys(value[0]).slice(0, 20)
          : [],
    });
    value
      .slice(0, 3)
      .forEach((item, index) => findArrays(item, `${path}[${index}]`, result));
    return result;
  }
  Object.entries(value).forEach(([key, child]) =>
    findArrays(child, `${path}.${key}`, result),
  );
  return result;
}

function findPageTokens(value, path = "$", result = []) {
  if (!value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findPageTokens(item, `${path}[${index}]`, result),
    );
    return result;
  }
  Object.entries(value).forEach(([key, child]) => {
    if (
      /page|cursor|next|start|token/i.test(key) &&
      (typeof child === "string" || typeof child === "number" || child == null)
    ) {
      result.push({ path: `${path}.${key}`, value: child });
    }
    findPageTokens(child, `${path}.${key}`, result);
  });
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const wishesResponses = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/10/wishes")) return;
    try {
      const json = await response.json();
      wishesResponses.push({
        url,
        status: response.status(),
        arrays: findArrays(json)
          .filter((entry) => entry.length > 0)
          .sort((a, b) => b.length - a.length)
          .slice(0, 8),
        pageTokens: findPageTokens(json).slice(0, 20),
        topLevelKeys: json && typeof json === "object" ? Object.keys(json) : [],
        json,
      });
    } catch (error) {
      wishesResponses.push({
        url,
        status: response.status(),
        error: String(error),
      });
    }
  });

  await page.goto(PADLET_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(10_000);
  await browser.close();

  const compact = wishesResponses.map(({ json, ...rest }) => rest);
  console.log(
    JSON.stringify(
      {
        responseCount: wishesResponses.length,
        compact,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
