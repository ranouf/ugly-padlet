const path = require("path");
const { chromium } = require("@playwright/test");

const PADLET_URL =
  "https://padlet.com/elanquoideneuf/ecole-elan-2025-2026-gsult4hljk84tu3a";
const MIN_EXPECTED_POSTS = 200;
const root = path.resolve(__dirname, "..");
const userDataDir = path.join(
  root,
  "test-results",
  `real-padlet-profile-${Date.now()}`,
);

const monthIndexes = new Map([
  ["janvier", 0],
  ["fevrier", 1],
  ["février", 1],
  ["mars", 2],
  ["avril", 3],
  ["mai", 4],
  ["juin", 5],
  ["juillet", 6],
  ["aout", 7],
  ["août", 7],
  ["septembre", 8],
  ["octobre", 9],
  ["novembre", 10],
  ["decembre", 11],
  ["décembre", 11],
]);

function parseFrenchDate(label) {
  const normalized = label.toLowerCase();
  const match = normalized.match(/(\d{1,2})\s+([a-zéûôîàèùç]+)\s+(20\d{2})/i);
  if (!match) return null;
  const month = monthIndexes.get(match[2]);
  if (month == null) return null;
  return new Date(Number(match[3]), month, Number(match[1])).getTime();
}

(async () => {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1600, height: 1100 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(PADLET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    try {
      await page.waitForSelector("#elan-padlet-reader", { timeout: 45_000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        bodyStart: document.body?.innerText?.slice(0, 800) || "",
        scripts: [...document.scripts]
          .map((script) => script.src)
          .filter(Boolean)
          .slice(0, 20),
      }));
      const screenshotPath = path.join(
        root,
        "test-results",
        `real-padlet-no-extension-${Date.now()}.png`,
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });
      throw new Error(
        `UglyPadlet ne s'est pas injecte. Debug: ${JSON.stringify({ ...debug, screenshotPath }, null, 2)}`,
      );
    }
    await page.waitForFunction(
      () => {
        const root = document.querySelector("#elan-padlet-reader");
        const cards = root?.querySelectorAll(".epr-card").length || 0;
        return root && !root.classList.contains("epr-loading") && cards >= 55;
      },
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const cards = [
        ...document.querySelectorAll("#elan-padlet-reader .epr-card"),
      ];
      const summary =
        document.querySelector("#elan-padlet-reader .epr-summary")
          ?.textContent || "";
      return {
        url: location.href,
        summary,
        count: cards.length,
        firstTitles: cards
          .slice(0, 8)
          .map((card) => card.querySelector("h2")?.textContent?.trim() || ""),
        dateLabels: cards.map(
          (card) =>
            card.querySelector(".epr-card-meta span")?.textContent?.trim() ||
            "",
        ),
        undatedCount: cards.filter((card) =>
          card
            .querySelector(".epr-date-badge")
            ?.textContent?.includes("Date non detectee"),
        ).length,
        aggregateLeaks: cards.filter((card) => {
          const text = card.textContent || "";
          return (
            text.includes("Mot des comités") &&
            text.includes("Documents de référence école") &&
            text.includes("Rentrée 2026")
          );
        }).length,
        hasLoader: Boolean(
          document.querySelector("#elan-padlet-reader .epr-loader"),
        ),
        cacheText: summary.includes("Depuis le cache"),
        loadSource:
          document.querySelector("#elan-padlet-reader")?.dataset.loadSource ||
          "",
        apiError:
          document.querySelector("#elan-padlet-reader")?.dataset.apiError || "",
        apiCount:
          document.querySelector("#elan-padlet-reader")?.dataset.apiCount || "",
        wallHashid:
          document.querySelector("#elan-padlet-reader")?.dataset.wallHashid ||
          "",
      };
    });

    const summaryTotal = Number(result.summary.match(/sur\s+(\d+)/)?.[1] || 0);
    if (result.count < MIN_EXPECTED_POSTS) {
      throw new Error(
        `Seulement ${result.count} communications trouvees, minimum attendu ${MIN_EXPECTED_POSTS}. Source=${result.loadSource}. API=${result.apiCount}. Wall=${result.wallHashid}. Erreur=${result.apiError}`,
      );
    }
    if (summaryTotal !== result.count) {
      throw new Error(
        `Le resume annonce ${summaryTotal}, mais ${result.count} cartes sont affichees.`,
      );
    }
    if (result.aggregateLeaks) {
      throw new Error(
        `${result.aggregateLeaks} carte(s) semblent contenir plusieurs sections fusionnees.`,
      );
    }
    if (result.undatedCount) {
      throw new Error(
        `${result.undatedCount} carte(s) affichent encore Date non detectee.`,
      );
    }
    if (result.cacheText) {
      throw new Error(
        "Le resume indique encore un chargement depuis le cache alors que le cache est desactive.",
      );
    }

    const datedValues = result.dateLabels
      .map(parseFrenchDate)
      .filter((value) => value != null);
    const sortedValues = [...datedValues].sort((a, b) => b - a);
    const firstOutOfOrder = datedValues.findIndex(
      (value, index) => value !== sortedValues[index],
    );
    if (firstOutOfOrder >= 0) {
      throw new Error(
        `Tri par date incorrect autour de la position ${firstOutOfOrder + 1}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          count: result.count,
          summary: result.summary,
          firstTitles: result.firstTitles,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
