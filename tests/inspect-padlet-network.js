const { chromium } = require("@playwright/test");

const PADLET_URL =
  "https://padlet.com/elanquoideneuf/ecole-elan-2025-2026-gsult4hljk84tu3a";
const COUNT_PATTERN =
  /"(?:post_count|posts_count|wish_count|wishes_count|subject_count|postsCount|wishCount)"\s*:\s*(\d{1,4})/g;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const seen = [];

  page.on("response", async (response) => {
    const request = response.request();
    const type = request.resourceType();
    const url = response.url();
    if (!["xhr", "fetch", "document"].includes(type) || !url.includes("padlet"))
      return;

    let countHint = "";
    try {
      const contentType = response.headers()["content-type"] || "";
      if (contentType.includes("json") || contentType.includes("html")) {
        const text = (await response.text()).slice(0, 40_000);
        countHint = [...text.matchAll(COUNT_PATTERN)]
          .map((match) => match[0])
          .slice(0, 6)
          .join(", ");
      }
    } catch {
      // Some responses are streams or blocked by the browser; ignore those.
    }

    seen.push({
      type,
      status: response.status(),
      url,
      countHint,
    });
  });

  await page.goto(PADLET_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(8_000);
  await browser.close();

  console.log(
    JSON.stringify(
      seen
        .filter(
          (entry) => entry.countHint || /api|wish|post|padlet/i.test(entry.url),
        )
        .slice(0, 40),
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
