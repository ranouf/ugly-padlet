const { test, expect } = require("@playwright/test");

const pageUrl = "/ugly-padlet-test.html";

async function clearUglyPadletStorage(page) {
  await page.goto(pageUrl);
  await page.evaluate(() => localStorage.clear());
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

test("visuel - lecteur desktop complet avec filtres sticky, footer et scrollbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await openApp(page, `${pageUrl}?lazy=1`, 14);

  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".epr-header")).toBeVisible();
  await expect(page.locator(".epr-summary")).toContainText(
    "14 communications affichees sur 14",
  );
  await expect(page.locator(".epr-credits")).toBeVisible();
  await expect(
    page.locator(".epr-credits a[href='mailto:uglypadlet@carnould.com']"),
  ).toHaveText("Suggestion ou bug : uglypadlet@carnould.com");
  await expect(page.locator(".epr-version")).toHaveText("UglyPadlet v2.0.17");
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

  await expect(page).toHaveScreenshot("reader-desktop.png", {
    maxDiffPixelRatio: 0.02,
  });
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
      "11 communications affichees sur 11",
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
    await expect(page).toHaveScreenshot(`reader-${name}.png`, {
      maxDiffPixelRatio: 0.03,
    });
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
  await expect(page).toHaveScreenshot("mobile-filters-collapsed.png", {
    maxDiffPixelRatio: 0.03,
  });

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
  await expect(page).toHaveScreenshot("mobile-filters-open-active-badge.png", {
    maxDiffPixelRatio: 0.03,
  });

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

  await expect(page).toHaveScreenshot("loading-overlay.png", {
    maxDiffPixelRatio: 0.03,
  });
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
  await expect(page).toHaveScreenshot("dropdown-communication.png", {
    maxDiffPixelRatio: 0.02,
  });

  await page.keyboard.press("Escape");
  await page.locator(".epr-multi-select-toggle").click();
  await expect(page.locator(".epr-multi-select-menu")).toBeVisible();
  await expect(
    page.locator(".epr-multi-select-menu .epr-checkbox-mark").first(),
  ).toBeVisible();
  await expect(
    page.locator(".epr-multi-select-toggle .bi-chevron-down"),
  ).toHaveCount(1);
  await expect(page).toHaveScreenshot("dropdown-section-multiselect.png", {
    maxDiffPixelRatio: 0.02,
  });
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
  await expect(page).toHaveScreenshot("reset-filters-restored-list.png", {
    maxDiffPixelRatio: 0.02,
  });
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
  await expect(page).toHaveScreenshot("modal-carousel-photo.png", {
    maxDiffPixelRatio: 0.03,
  });
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
  await expect(page).toHaveScreenshot("modal-mobile-swipe-no-post-arrows.png", {
    maxDiffPixelRatio: 0.03,
  });
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
    await expect(page).toHaveScreenshot(`card-download-link-${name}.png`, {
      maxDiffPixelRatio: 0.03,
    });
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
  await expect(page).toHaveScreenshot("modal-pdf-full-height.png", {
    maxDiffPixelRatio: 0.04,
  });
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
    return {
      gap,
      textFollowsVideo: video.nextElementSibling === text,
    };
  });
  expect(videoTextLayout.gap).toBeGreaterThanOrEqual(14);
  expect(videoTextLayout.textFollowsVideo).toBe(true);
  await expect(page).toHaveScreenshot("modal-youtube-autolink.png", {
    mask: [page.locator(".epr-youtube-viewer iframe")],
    maxDiffPixelRatio: 0.03,
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
  await expect(page).toHaveScreenshot("original-padlet-mode.png", {
    maxDiffPixelRatio: 0.03,
  });
});
