const { chromium } = require("@playwright/test");

const PADLET_URL =
  "https://padlet.com/elanquoideneuf/ecole-elan-2025-2026-gsult4hljk84tu3a";

function summarizeWish(wish) {
  const attributes = wish.attributes || {};
  return {
    id: wish.id,
    type: wish.type,
    attributeKeys: Object.keys(attributes).sort(),
    title: attributes.subject,
    body: attributes.body,
    attachment: attributes.attachment,
    attachmentLinkKeys: attributes.attachment_link
      ? Object.keys(attributes.attachment_link).sort()
      : [],
    sectionId: attributes.wall_section_id,
    createdAt: attributes.created_at,
    updatedAt: attributes.updated_at,
    publishedAt: attributes.published_at,
    sortIndex: attributes.sort_index,
    author: attributes.author?.name || attributes.author_name,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let firstPayload = null;

  page.on("response", async (response) => {
    if (firstPayload || !response.url().includes("/api/10/wishes")) return;
    firstPayload = await response.json().catch(() => null);
  });

  await page.goto(PADLET_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(8_000);
  await browser.close();

  const wishes = firstPayload?.data || [];
  console.log(
    JSON.stringify(
      {
        meta: firstPayload?.meta,
        count: wishes.length,
        samples: wishes.slice(0, 5).map(summarizeWish),
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
