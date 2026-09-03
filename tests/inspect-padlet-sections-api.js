const { chromium } = require("@playwright/test");

const PADLET_URL =
  "https://padlet.com/elanquoideneuf/ecole-elan-2025-2026-gsult4hljk84tu3a";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let sectionsPayload = null;

  page.on("response", async (response) => {
    if (sectionsPayload || !response.url().includes("/api/5/wall_sections"))
      return;
    sectionsPayload = await response.json().catch(() => null);
  });

  await page.goto(PADLET_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(8_000);
  await browser.close();

  const sections = sectionsPayload?.data || [];
  console.log(
    JSON.stringify(
      {
        count: sections.length,
        topLevelKeys: sectionsPayload ? Object.keys(sectionsPayload) : [],
        samples: sections.map((section) => ({
          id: section.id,
          type: section.type,
          attributes: section.attributes,
        })),
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
