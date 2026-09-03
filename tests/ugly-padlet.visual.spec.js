const { test, expect } = require("@playwright/test");

const pageUrl = "/ugly-padlet-test.html";

async function clearUglyPadletStorage(page) {
  await page.goto(pageUrl);
  await page.evaluate(() => localStorage.clear());
}

async function seedPreviousConnection(page, daysAgo = 6) {
  await page.addInitScript((daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const storedDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).toISOString();
    localStorage.setItem(
      "uglyPadlet:ecoleElan:currentConnectionDate:v1",
      storedDate,
    );
  }, daysAgo);
}

async function openApp(page, url = pageUrl, expectedCount = 11) {
  await page.goto(url);
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  if (Number.isFinite(expectedCount)) {
    await expect(page.locator(".epr-card")).toHaveCount(expectedCount, {
      timeout: 15000,
    });
  } else {
    await expect(page.locator(".epr-card").first()).toBeVisible({
      timeout: 15000,
    });
  }
  await stabilizeVisuals(page);
}

async function stabilizeVisuals(page) {
  await page.addStyleTag({
    content: `
      #elan-padlet-reader *,
      #elan-padlet-reader *::before,
      #elan-padlet-reader *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(() => {
    document
      .querySelector("#elan-padlet-reader")
      ?.scrollTo({ top: 0, left: 0 });
  });
}

async function openCard(page, title) {
  const card = page.locator(".epr-card", { hasText: title });
  await expect(card).toHaveCount(1);
  await card.locator("h2").click();
  await expect(page.locator(".epr-modal")).toBeVisible();
  await stabilizeVisuals(page);
}

async function captureVisual(page, name, options = {}) {
  await page.screenshot({
    path: test.info().outputPath(name),
    fullPage: true,
    ...options,
  });
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page
    .locator("#elan-padlet-reader")
    .evaluate((node) => {
      const shell = node.querySelector(".epr-shell");
      return {
        rootOverflow: node.scrollWidth - node.clientWidth,
        shellOverflow: shell ? shell.scrollWidth - shell.clientWidth : 0,
      };
    });
  expect(overflow.rootOverflow).toBeLessThanOrEqual(2);
  expect(overflow.shellOverflow).toBeLessThanOrEqual(2);
}

async function expectIconCentered(page, selector) {
  const metrics = await page
    .locator(selector)
    .first()
    .evaluate((button) => {
      const icon = button.querySelector(".epr-icon");
      const buttonBox = button.getBoundingClientRect();
      const iconBox = icon.getBoundingClientRect();
      return {
        dx: Math.abs(
          buttonBox.left +
            buttonBox.width / 2 -
            (iconBox.left + iconBox.width / 2),
        ),
        dy: Math.abs(
          buttonBox.top +
            buttonBox.height / 2 -
            (iconBox.top + iconBox.height / 2),
        ),
      };
    });
  expect(metrics.dx).toBeLessThanOrEqual(1);
  expect(metrics.dy).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await clearUglyPadletStorage(page);
});

test("visuel - pastille nouveau sur publication recente", async ({ page }) => {
  await seedPreviousConnection(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route("**/ugly-padlet-test.html?new=1", async (route) => {
    const response = await route.fetch();
    const fixture = await response.text();
    await route.fulfill({
      response,
      body: fixture.replace(
        "</main>",
        `
        <article class="post">
          <h2>Nouvelle publication de test</h2>
          <p>mercredi 2 septembre 2026</p>
          <p>Communication recente pour valider la pastille nouveau.</p>
        </article>
        </main>`,
      ),
    });
  });
  await openApp(page, `${pageUrl}?new=1`, 12);

  const card = page.locator(".epr-card", {
    hasText: "Nouvelle publication de test",
  });
  await expect(card.locator(".epr-new-badge")).toBeVisible();
  await captureVisual(page, "new-post-badge.png");

  await page.locator(".epr-single-select-toggle").click();
  await expect(page.locator('[data-status-value="new"]')).toBeVisible();
  await page.locator('[data-status-value="new"]').click();
  await expect(page.locator(".epr-status-filter-label")).toHaveText(
    "Nouvelles",
  );
  await expect(page.locator(".epr-card")).toHaveCount(1);
  await expect(page.locator(".epr-summary")).toContainText(
    "1/12 communications dont 1 nouvelle depuis la derniere connexion le",
  );
  await captureVisual(page, "new-post-filtered.png");
});

test("visuel - lecteur desktop complet avec filtres sticky, footer et scrollbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await openApp(page, `${pageUrl}?lazy=1`, 14);

  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".epr-header")).toBeVisible();
  await expect(page.locator(".epr-summary")).toContainText("14 communications");
  await expect(page.locator(".epr-credits")).toBeVisible();
  await expect(
    page.locator(".epr-credits a[href='mailto:uglypadlet@carnould.com']"),
  ).toHaveText("Suggestion ou bug : uglypadlet@carnould.com");
  await expect(page.locator(".epr-version")).toHaveText("UglyPadlet v2.0.18");
  const headerEdges = await page.locator(".epr-header").evaluate((header) => {
    const reader = document.querySelector("#elan-padlet-reader");
    const rect = header.getBoundingClientRect();
    const readerRect = reader.getBoundingClientRect();
    return {
      top: Math.round(rect.top - readerRect.top),
      left: Math.round(rect.left - readerRect.left),
      rightGap: Math.round(reader.clientWidth - rect.right + readerRect.left),
    };
  });
  expect(headerEdges.top).toBe(0);
  expect(headerEdges.left).toBe(0);
  expect(headerEdges.rightGap).toBe(0);
  const footerEdges = await page.locator(".epr-credits").evaluate((footer) => {
    const rect = footer.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      rightGap: Math.round(window.innerWidth - rect.right),
    };
  });
  expect(footerEdges.left).toBe(0);
  expect(footerEdges.rightGap).toBe(0);

  const scrollbar = await page.locator(".epr-scrollbar").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      right: Math.round(window.innerWidth - rect.right),
      height: Math.round(rect.height),
    };
  });
  expect(scrollbar.width).toBe(20);
  expect(scrollbar.right).toBe(0);
  expect(scrollbar.height).toBeGreaterThan(300);
  await captureVisual(page, "reader-desktop.png");
});

test("visuel - lecteur responsive laptop tablette et mobile sans debordement horizontal", async ({
  page,
}) => {
  const viewports = [
    ["laptop", 1280, 720],
    ["tablet", 820, 900],
    ["mobile", 390, 844],
  ];

  for (const [name, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await openApp(page, pageUrl, 11);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator(".epr-summary")).toContainText(
      "11 communications",
    );
    await expect(page.locator(".epr-actions")).toBeVisible();
    await expect(page.locator(".epr-filters")).toBeVisible();
    if (name === "tablet" || name === "mobile") {
      await expect(page.locator(".epr-scrollbar")).toBeHidden();
      const readerScroll = await page
        .locator("#elan-padlet-reader")
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            gutter: style.scrollbarGutter,
            overflowY: style.overflowY,
            scrollbarWidth: style.scrollbarWidth,
          };
        });
      expect(readerScroll.gutter).toBe("auto");
      expect(readerScroll.overflowY).toBe("auto");
      const scrollbarWidth = readerScroll.scrollbarWidth;
      expect(scrollbarWidth).toBe("none");
    }
    if (name === "mobile") {
      await expect(page.locator(".epr-filter-toggle")).toBeVisible();
      await expect(page.locator(".epr-filter-fields")).toBeHidden();
      await expectIconCentered(page, ".epr-filter-toggle");
    }
    await expect(page.locator(".epr-card").first()).toBeVisible();
    await captureVisual(page, `reader-${name}.png`);
  }
});

test("visuel - filtres mobiles replie ouverts avec badge actif", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);

  await expect(page.locator(".epr-filter-toggle")).toBeVisible();
  await expect(page.locator(".epr-filter-toggle .bi-filter")).toHaveCount(1);
  await expectIconCentered(page, ".epr-filter-toggle");
  await expect(page.locator(".epr-scrollbar")).toBeHidden();
  await expect(page.locator(".epr-filter-fields")).toBeHidden();
  await expect(page.locator(".epr-filter-count")).toBeHidden();
  await captureVisual(page, "mobile-filters-collapsed.png");

  await page.locator(".epr-filter-toggle").click();
  await expect(page.locator(".epr-filter-fields")).toBeVisible();
  await page.locator('[data-filter="query"]').fill("secret");
  await page.locator(".epr-single-select-toggle").click();
  await page.locator('[data-status-value="upcoming"]').click();
  await expect(page.locator(".epr-filter-count")).toHaveText("2");
  await expect(page.locator(".epr-filter-toggle")).toHaveAttribute(
    "aria-label",
    "Filtres, 2 actifs",
  );
  await expect(page.locator('[data-action="reset-filters"]')).toBeVisible();
  await stabilizeVisuals(page);
  await captureVisual(page, "mobile-filters-open-active-badge.png");

  await page.locator('[data-action="reset-filters"]').click();
  await expect(page.locator(".epr-filter-count")).toBeHidden();
  await expect(page.locator(".epr-card")).toHaveCount(11);
});

test("visuel - overlay de chargement des communications", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${pageUrl}?lazy=1`);
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  await expect(page.locator(".epr-loader")).toBeVisible();
  await expect(page.locator(".epr-loader-found")).toContainText(
    "sur 14 attendues",
  );
  await stabilizeVisuals(page);
  await captureVisual(page, "loading-overlay.png");
});

test("visuel - dropdown communication et dropdown section multi-selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  await openApp(page);

  await page.locator(".epr-single-select-toggle").click();
  await expect(page.locator(".epr-single-select-menu")).toBeVisible();
  await expect(
    page.locator(".epr-single-select-menu .epr-checkbox-mark"),
  ).toHaveCount(0);
  await expect(
    page.locator(".epr-single-select-option.epr-selected"),
  ).toHaveCount(1);
  await expect(
    page.locator(".epr-single-select-toggle .bi-chevron-down"),
  ).toHaveCount(1);
  await captureVisual(page, "dropdown-communication.png");

  await page.keyboard.press("Escape");
  await page.locator(".epr-multi-select-toggle").click();
  await expect(page.locator(".epr-multi-select-menu")).toBeVisible();
  await expect(
    page.locator(".epr-multi-select-menu .epr-checkbox-mark").first(),
  ).toBeVisible();
  await expect(
    page.locator(".epr-multi-select-toggle .bi-chevron-down"),
  ).toHaveCount(1);
  await captureVisual(page, "dropdown-section-multiselect.png");
});

test("visuel - reset filtres depuis zero resultat reconstruit la liste", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await openApp(page);

  await page.locator('[data-filter="query"]').fill("aucun-resultat-uglypadlet");
  await expect(page.locator(".epr-empty")).toBeVisible();
  await page.reload();
  await expect(page.locator(".epr-empty")).toBeVisible();

  await page.locator('[data-action="reset-filters"]').click();
  await expect(page.locator(".epr-empty")).toHaveCount(0);
  await expect(page.locator(".epr-card")).toHaveCount(11);
  await stabilizeVisuals(page);
  await captureVisual(page, "reset-filters-restored-list.png");
});

test("visuel - modal carousel photo avec boutons centres et scrollbar interne", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 820 });
  await openApp(page);
  await openCard(page, "Album photos");

  await expectIconCentered(page, ".epr-modal-close");
  await expectIconCentered(page, ".epr-modal-prev");
  await expectIconCentered(page, ".epr-modal-next");
  await expectIconCentered(page, ".epr-gallery-prev");
  await expectIconCentered(page, ".epr-gallery-next");
  await expect(page.locator(".epr-gallery-count")).toHaveText("1 / 3");
  await captureVisual(page, "modal-carousel-photo.png");
});

test("visuel - modal mobile sans fleches de publication avec swipe actif", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await openCard(page, "Nouvelle rentree");

  await expect(page.locator(".epr-modal")).toHaveAttribute(
    "data-swipe",
    "hammerjs",
  );
  await expect(page.locator(".epr-modal-prev")).toBeHidden();
  await expect(page.locator(".epr-modal-next")).toBeHidden();
  await expect(page.locator(".epr-modal-close")).toBeVisible();
  await expectIconCentered(page, ".epr-modal-close");
  await captureVisual(page, "modal-mobile-swipe-no-post-arrows.png");
});

test("visuel - liens de telechargement alignes a droite avec icone responsive", async ({
  page,
}) => {
  const viewports = [
    ["desktop", 1360, 820],
    ["tablet", 820, 900],
    ["mobile", 390, 844],
  ];

  for (const [name, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await openApp(page);
    const card = page.locator(".epr-card", { hasText: "Nouvelle rentree" });
    await expect(card.locator("h2")).toBeVisible();

    const link = card.locator(".epr-links a").first();
    await expect(link.locator(".bi-download")).toHaveCount(1);
    await expect(
      card.locator(
        ".epr-links a[href='https://www.carnould.com/'] .bi-box-arrow-up-right",
      ),
    ).toHaveCount(1);
    const metrics = await card.evaluate((node) => {
      const card = node.getBoundingClientRect();
      const links = node.querySelector(".epr-links").getBoundingClientRect();
      const anchor = node.querySelector(".epr-links a");
      const link = anchor.getBoundingClientRect();
      return {
        rightGap: Math.round(card.right - links.right),
        iconBeforeText:
          anchor.querySelector(".epr-icon").getBoundingClientRect().right <=
          anchor.querySelector("span:last-child").getBoundingClientRect().left,
      };
    });
    expect(metrics.rightGap).toBeLessThanOrEqual(20);
    expect(metrics.iconBeforeText).toBe(true);
    await stabilizeVisuals(page);
    await captureVisual(page, `card-download-link-${name}.png`);
  }
});

test("visuel - modal PDF garde les informations et le viewer pleine hauteur", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 820 });
  await openApp(page);
  await openCard(page, "PV 16 juin 2025 Fondation");

  const panel = page.locator(".epr-modal-panel-pdf");
  const frame = panel.locator("iframe");
  await expect(panel.locator(".epr-modal-header")).toBeVisible();
  await expect(panel.locator("h2")).toHaveText("PV 16 juin 2025 Fondation");
  await expect(panel.locator(".epr-card-meta")).toContainText("16 juin 2025");
  await expect(frame).toBeVisible();
  await expect
    .poll(
      async () => {
        return frame.evaluate((node) =>
          Math.round(node.getBoundingClientRect().height),
        );
      },
      { timeout: 10000 },
    )
    .toBeGreaterThan(360);
  const frameBox = await frame.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(frameBox.height).toBeGreaterThan(360);
  expect(frameBox.width).toBeGreaterThan(800);
  await expectIconCentered(page, ".epr-modal-close");
  await captureVisual(page, "modal-pdf-full-height.png");
});

test("visuel - modal texte avec lien brut clickable et lecteur YouTube", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 820 });
  await openApp(page);
  await openCard(page, "Objets perdus");

  const inlineLink = page.locator(
    ".epr-modal p a[href='https://colleamoi.com/fr_CA/collecte-de-fonds/supporter']",
  );
  await expect(inlineLink).toHaveText(
    "https://colleamoi.com/fr_CA/collecte-de-fonds/supporter",
  );
  await expect(inlineLink).toHaveAttribute("target", "_blank");
  await expect(
    page.locator(".epr-modal .epr-youtube-viewer iframe"),
  ).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/BiUd53UqMis/);
  const videoTextLayout = await page.locator(".epr-modal").evaluate((modal) => {
    const body = modal.querySelector(".epr-modal-body");
    const video = modal.querySelector(".epr-youtube-viewer");
    const text = modal.querySelector(".epr-post-text");
    const style = getComputedStyle(body);
    const gap = [style.gap, style.rowGap, style.columnGap]
      .map(Number.parseFloat)
      .find(Number.isFinite);
    const videoRect = video.getBoundingClientRect();
    const textRect = text.getBoundingClientRect();
    return {
      gap: gap ?? Math.round(textRect.top - videoRect.bottom),
      textFollowsVideo: video.nextElementSibling === text,
    };
  });
  expect(videoTextLayout.gap).toBeGreaterThanOrEqual(14);
  expect(videoTextLayout.textFollowsVideo).toBe(true);
  await captureVisual(page, "modal-youtube-autolink.png", {
    mask: [page.locator(".epr-youtube-viewer iframe")],
  });
});

test("visuel - mode Padlet original et bouton retour lecteur", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openApp(page);

  await page.locator('[data-action="toggle-original"]').click();
  await expect(page.locator("#elan-padlet-reader")).toHaveClass(
    /epr-minimized/,
  );
  await expect(page.locator('[data-action="toggle-original"]')).toHaveText(
    "Revenir au lecteur",
  );
  await expect(page.locator(".epr-header")).toBeVisible();
  await captureVisual(page, "original-padlet-mode.png");
});
