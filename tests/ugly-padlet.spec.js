const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

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
  await expect(page.locator(".epr-card")).toHaveCount(expectedCount);
}

async function openAppWithExtraPost(page, postHtml, expectedCount = 12) {
  const fixture = fs.readFileSync(
    path.join(__dirname, "..", "ugly-padlet-test.html"),
    "utf8",
  );
  await page.route("**/ugly-padlet-test.html?vimeo=1", (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixture.replace("</main>", `${postHtml}</main>`),
    });
  });
  await openApp(page, `${pageUrl}?vimeo=1`, expectedCount);
}

async function cardTitles(page) {
  return page.locator(".epr-card h2").allTextContents();
}

async function openCard(page, title) {
  const card = page.locator(".epr-card", { hasText: title });
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(page.locator(".epr-modal")).toBeVisible();
}

async function swipeModal(page, direction) {
  await page.locator(".epr-modal-panel").evaluate((panel, direction) => {
    const box = panel.getBoundingClientRect();
    const y = box.top + box.height / 2;
    const startX = box.left + box.width * (direction === "left" ? 0.82 : 0.18);
    const endX = box.left + box.width * (direction === "left" ? 0.18 : 0.82);
    const points = [
      startX,
      startX + (endX - startX) * 0.35,
      startX + (endX - startX) * 0.7,
      endX,
    ];

    panel.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        buttons: 1,
        clientX: points[0],
        clientY: y,
      }),
    );

    for (const x of points.slice(1, -1)) {
      panel.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          buttons: 1,
          clientX: x,
          clientY: y,
        }),
      );
    }

    panel.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        buttons: 0,
        clientX: points[3],
        clientY: y,
      }),
    );
  }, direction);
}

async function toggleSection(page, section) {
  if (await page.locator(".epr-multi-select-menu").isHidden()) {
    await page.locator(".epr-multi-select-toggle").click();
  }
  await page.locator(".epr-multi-select-option", { hasText: section }).click();
}

async function clearSections(page) {
  if (await page.locator(".epr-multi-select-menu").isHidden()) {
    await page.locator(".epr-multi-select-toggle").click();
  }
  await page
    .locator(".epr-multi-select-option", { hasText: "Toutes les sections" })
    .click();
}

async function setStatus(page, label) {
  if (await page.locator(".epr-single-select-menu").isHidden()) {
    await page.locator(".epr-single-select-toggle").click();
  }
  await page.locator(".epr-single-select-option", { hasText: label }).click();
}

test.beforeEach(async ({ page }) => {
  await clearUglyPadletStorage(page);
});

test("affiche le Padlet en liste verticale triee par date recente", async ({
  page,
}) => {
  await openApp(page);

  await expect(page.locator(".epr-summary")).toContainText("11 communications");
  await expect(page.locator(".epr-summary")).not.toContainText(
    "Depuis le cache",
  );

  const titles = await cardTitles(page);
  expect(titles.slice(0, 4)).toEqual([
    "Nouvelle rentree",
    "GS - Sortie mediatheque",
    "Cantine - Menu special",
    "Calendrier scolaire 2025-2026",
  ]);
  expect(titles.indexOf("Calendrier scolaire 2025-2026")).toBeLessThan(
    titles.indexOf("MS - Piscine"),
  );
  expect(titles).toContain("Garderie");
});

test("charge au demarrage toutes les communications lazy-load existantes", async ({
  page,
}) => {
  await page.goto(`${pageUrl}?lazy=1`);
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  await expect(page.locator(".epr-loader")).toBeVisible();
  await expect(page.locator(".epr-loader-found")).toContainText(
    "sur 14 attendues",
  );

  await expect(page.locator(".epr-card")).toHaveCount(14);
  await expect(page.locator(".epr-loader")).toBeHidden();
  await expect(page.locator(".epr-summary")).toContainText("14 communications");
  await expect(page.locator(".epr-card h2")).toContainText([
    "Lazy - Derniere minute",
    "Nouvelle rentree",
    "Lazy - Fournitures",
  ]);

  const titles = await cardTitles(page);
  expect(titles).toContain("Lazy - Reunion automne");
  expect(titles.slice(0, 6)).toEqual([
    "Lazy - Derniere minute",
    "Nouvelle rentree",
    "Lazy - Fournitures",
    "GS - Sortie mediatheque",
    "Cantine - Menu special",
    "Calendrier scolaire 2025-2026",
  ]);
});

test("filtre par recherche, type, section et periode, puis conserve les filtres", async ({
  page,
}) => {
  await openApp(page);

  await page.locator('[data-filter="query"]').fill("piscine");
  await expect(page.locator(".epr-card")).toHaveCount(1);
  await expect(page.locator(".epr-card h2")).toHaveText("MS - Piscine");

  await page.locator('[data-filter="query"]').fill("");
  await toggleSection(page, "GS");
  await expect(page.locator(".epr-card")).toHaveCount(1);
  await expect(page.locator(".epr-card h2")).toHaveText(
    "GS - Sortie mediatheque",
  );

  await toggleSection(page, "Cantine");
  await expect(page.locator(".epr-card h2")).toHaveText([
    "GS - Sortie mediatheque",
    "Cantine - Menu special",
  ]);
  await expect(page.locator(".epr-section-filter-label")).toHaveText(
    "2 sections",
  );

  await clearSections(page);
  await expect(page.locator('[data-filter="status"]')).toHaveCount(0);
  await expect(
    page.locator(".epr-single-select-option", { hasText: "Sans date trouvee" }),
  ).toHaveCount(0);
  await page.locator(".epr-single-select-toggle").click();
  await expect(
    page.locator(".epr-single-select-menu .epr-checkbox-mark"),
  ).toHaveCount(0);
  await expect(
    page.locator(".epr-single-select-option.epr-selected"),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.locator(".epr-multi-select-toggle").click();
  await expect(
    page.locator(".epr-multi-select-menu .epr-checkbox-mark").first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await setStatus(page, "Toutes");
  await page.locator('[data-filter="from"]').fill("2026-06-01");
  await page.locator('[data-filter="to"]').fill("2026-06-30");
  await expect(page.locator(".epr-card h2")).toHaveText([
    "Cantine - Menu special",
    "Calendrier scolaire 2025-2026",
    "MS - Piscine",
  ]);
  await expect(page.locator(".epr-summary")).toContainText(
    "3/11 communications",
  );

  await page.reload();
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  await expect(page.locator('[data-filter="from"]')).toHaveValue("2026-06-01");
  await expect(page.locator('[data-filter="to"]')).toHaveValue("2026-06-30");
  await expect(page.locator(".epr-card h2")).toHaveText([
    "Cantine - Menu special",
    "Calendrier scolaire 2025-2026",
    "MS - Piscine",
  ]);

  await page.locator('[data-action="reset-filters"]').click();
  await expect(page.locator('[data-filter="query"]')).toHaveValue("");
  await expect(page.locator(".epr-status-filter-label")).toHaveText("Toutes");
  await expect(page.locator(".epr-section-filter-label")).toHaveText(
    "Toutes les sections",
  );
  await expect(page.locator('[data-filter="from"]')).toHaveValue("");
  await expect(page.locator('[data-filter="to"]')).toHaveValue("");
  await expect(page.locator(".epr-card")).toHaveCount(11);
});

test("reconstruit la liste apres reload sur zero resultat puis reset filtres", async ({
  page,
}) => {
  await openApp(page);

  await page.locator('[data-filter="query"]').fill("aucun-resultat-uglypadlet");
  await expect(page.locator(".epr-card")).toHaveCount(0);
  await expect(page.locator(".epr-empty")).toContainText(
    "Aucune communication",
  );

  await page.reload();
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  await expect(page.locator('[data-filter="query"]')).toHaveValue(
    "aucun-resultat-uglypadlet",
  );
  await expect(page.locator(".epr-empty")).toContainText(
    "Aucune communication",
  );

  await page.locator('[data-action="reset-filters"]').click();
  await expect(page.locator('[data-filter="query"]')).toHaveValue("");
  await expect(page.locator(".epr-empty")).toHaveCount(0);
  await expect(page.locator(".epr-summary")).toContainText("11 communications");
  await expect(page.locator(".epr-card")).toHaveCount(11);
});

test("filtre plusieurs sections a la fois et conserve la selection", async ({
  page,
}) => {
  await openApp(page);

  await toggleSection(page, "GS");
  await toggleSection(page, "Cantine");
  await expect(page.locator(".epr-section-filter-label")).toHaveText(
    "2 sections",
  );
  await expect(
    page.locator(".epr-multi-select-toggle .bi-chevron-down"),
  ).toHaveCount(1);
  await expect(page.locator(".epr-card h2")).toHaveText([
    "GS - Sortie mediatheque",
    "Cantine - Menu special",
  ]);

  await page.reload();
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  await expect(page.locator(".epr-section-filter-label")).toHaveText(
    "2 sections",
  );
  await expect(page.locator(".epr-card h2")).toHaveText([
    "GS - Sortie mediatheque",
    "Cantine - Menu special",
  ]);
});

test("indique les publications nouvelles depuis la derniere connexion", async ({
  page,
}) => {
  await seedPreviousConnection(page);
  await openAppWithExtraPost(
    page,
    `
    <article class="post">
      <h2>Nouvelle publication de test</h2>
      <p>mercredi 2 septembre 2026</p>
      <p>Communication recente pour valider la pastille nouveau.</p>
    </article>
    <article class="post">
      <h2>Ancienne publication de test</h2>
      <p>lundi 15 juin 2026</p>
      <p>Communication ancienne qui ne doit pas avoir de pastille.</p>
    </article>
  `,
    13,
  );

  const storedConnectionDate = await page.evaluate(() =>
    localStorage.getItem("uglyPadlet:ecoleElan:lastConnectionDate:v1"),
  );
  const expectedStoredDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
      .toISOString()
      .slice(0, 10);
  });
  expect(storedConnectionDate).toContain(expectedStoredDate);

  const recentCard = page.locator(".epr-card", {
    hasText: "Nouvelle publication de test",
  });
  await expect(recentCard.locator(".epr-new-badge")).toBeVisible();
  await expect(recentCard.locator(".epr-new-badge")).toHaveAttribute(
    "aria-label",
    "Nouvelle publication",
  );
  await expect(page.locator(".epr-summary")).toContainText(
    /13 communications dont 1 nouvelle depuis la derniere connexion le /,
  );

  const oldCard = page.locator(".epr-card", {
    hasText: "Ancienne publication de test",
  });
  await expect(oldCard.locator(".epr-new-badge")).toHaveCount(0);
  await expect(page.locator(".epr-new-badge")).toHaveCount(1);

  await page.locator(".epr-single-select-toggle").click();
  await expect(page.locator('[data-status-value="new"]')).toHaveText(
    "Nouvelles",
  );
  await page.locator('[data-status-value="new"]').click();
  await expect(page.locator(".epr-status-filter-label")).toHaveText(
    "Nouvelles",
  );
  await expect(page.locator(".epr-card")).toHaveCount(1);
  await expect(page.locator(".epr-card h2")).toHaveText(
    "Nouvelle publication de test",
  );
  await expect(page.locator(".epr-summary")).toContainText(
    "1/13 communications dont 1 nouvelle depuis la derniere connexion le",
  );
});

test("conserve la derniere connexion apres un refresh le meme jour", async ({
  page,
}) => {
  await openApp(page);
  await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    localStorage.setItem(
      "uglyPadlet:ecoleElan:currentConnectionDate:v1",
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      ).toISOString(),
    );
    localStorage.removeItem("uglyPadlet:ecoleElan:lastConnectionDate:v1");
  });

  await page.reload();
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  const lastConnectionDate = await page.evaluate(() =>
    localStorage.getItem("uglyPadlet:ecoleElan:lastConnectionDate:v1"),
  );
  await expect(page.locator(".epr-summary")).toContainText("11 communications");

  await page.reload();
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  await expect(page.locator(".epr-summary")).toContainText("11 communications");
  await expect(
    page.evaluate(() =>
      localStorage.getItem("uglyPadlet:ecoleElan:lastConnectionDate:v1"),
    ),
  ).resolves.toBe(lastConnectionDate);
});

test("utilise la meme scrollbar a droite dans le fil, les dropdowns et les modals", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await openApp(page);

  await expect(page.locator(".epr-scrollbar")).toBeVisible();
  const rootScrollbar = await page
    .locator(".epr-scrollbar")
    .evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        visible: !node.hidden,
        right: Math.round(window.innerWidth - rect.right),
        width: Math.round(rect.width),
        cursor: getComputedStyle(node).cursor,
        thumbCursor: getComputedStyle(
          node.querySelector(".epr-scrollbar-thumb"),
        ).cursor,
      };
    });
  expect(rootScrollbar).toEqual({
    visible: true,
    right: 0,
    width: 20,
    cursor: "pointer",
    thumbCursor: "pointer",
  });

  await page.locator(".epr-multi-select-toggle").click();
  const menuStyle = await page
    .locator(".epr-multi-select-menu")
    .evaluate((node) => {
      const style = getComputedStyle(node);
      const webkit = getComputedStyle(node, "::-webkit-scrollbar");
      const button = getComputedStyle(node, "::-webkit-scrollbar-button");
      return {
        overflowY: style.overflowY || style.overflow,
        scrollbarColor: style.scrollbarColor,
        scrollbarWidth: style.scrollbarWidth,
        webkitWidth: webkit.width,
        buttonDisplay: button.display,
      };
    });
  expect(menuStyle.overflowY).toBe("auto");
  expect(menuStyle.scrollbarColor).toContain("rgb");
  expect(menuStyle.scrollbarWidth).toBe("thin");
  expect(menuStyle.webkitWidth).toBe("20px");
  expect(menuStyle.buttonDisplay).toBe("none");

  await page.keyboard.press("Escape");
  await openCard(page, "Garderie");
  const modalStyle = await page.locator(".epr-modal-body").evaluate((node) => {
    const style = getComputedStyle(node);
    const webkit = getComputedStyle(node, "::-webkit-scrollbar");
    const button = getComputedStyle(node, "::-webkit-scrollbar-button");
    const rect = node.getBoundingClientRect();
    return {
      overflowY: style.overflowY || style.overflow,
      scrollbarColor: style.scrollbarColor,
      scrollbarWidth: style.scrollbarWidth,
      webkitWidth: webkit.width,
      buttonDisplay: button.display,
      marginRight: style.marginRight,
      right: Math.round(window.innerWidth - rect.right),
    };
  });
  expect(modalStyle.overflowY).toBe("auto");
  expect(modalStyle.scrollbarColor).toContain("rgb");
  expect(modalStyle.scrollbarWidth).toBe("thin");
  expect(modalStyle.webkitWidth).toBe("20px");
  expect(modalStyle.buttonDisplay).toBe("none");
  expect(modalStyle.marginRight).toBe("12px");
  expect(modalStyle.right).toBeGreaterThan(0);
});

test("affiche liens, contact et conserve le fond original", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openApp(page);

  await expect(
    page.locator(".epr-credits a[href='mailto:uglypadlet@carnould.com']"),
  ).toHaveText("Suggestion ou bug : uglypadlet@carnould.com");
  await expect(page.locator(".epr-version")).toHaveText("UglyPadlet v2.0.19");
  await expect(page.locator(".epr-scrollbar")).toBeVisible();

  const background = await page
    .locator("#elan-padlet-reader")
    .evaluate((node) =>
      getComputedStyle(node).getPropertyValue("--epr-site-background"),
    );
  expect(background).toContain("url(");

  const scrollStyle = await page
    .locator("#elan-padlet-reader")
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        overflowY: style.overflowY,
        scrollbarColor: style.scrollbarColor,
        scrollbarGutter: style.scrollbarGutter,
      };
    });
  expect(scrollStyle.overflowY).toBe("scroll");
  expect(scrollStyle.scrollbarColor).toContain("rgb");
  expect(scrollStyle.scrollbarGutter).toContain("stable");

  const scrollbarMetrics = await page
    .locator(".epr-scrollbar")
    .evaluate((node) => {
      const root = document.querySelector("#elan-padlet-reader");
      const thumb = node.querySelector(".epr-scrollbar-thumb");
      const nodeRect = node.getBoundingClientRect();
      const thumbRect = thumb.getBoundingClientRect();
      return {
        hidden: node.hidden,
        width: Math.round(nodeRect.width),
        height: Math.round(nodeRect.height),
        thumbHeight: Math.round(thumbRect.height),
        rightInsetFromViewport: Math.round(window.innerWidth - nodeRect.right),
        scrollable: root.scrollHeight > root.clientHeight,
      };
    });
  expect(scrollbarMetrics).toMatchObject({
    hidden: false,
    width: 20,
    rightInsetFromViewport: 0,
    scrollable: true,
  });
  expect(scrollbarMetrics.height).toBeGreaterThan(300);
  expect(scrollbarMetrics.thumbHeight).toBeGreaterThan(40);

  const thumbBox = await page.locator(".epr-scrollbar-thumb").boundingBox();
  expect(thumbBox).toBeTruthy();
  const initialScrollTop = await page
    .locator("#elan-padlet-reader")
    .evaluate((node) => node.scrollTop);
  await page.mouse.move(
    thumbBox.x + thumbBox.width / 2,
    thumbBox.y + thumbBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    thumbBox.x + thumbBox.width / 2,
    thumbBox.y + thumbBox.height / 2 + 180,
    { steps: 8 },
  );
  await page.mouse.up();
  const draggedScrollTop = await page
    .locator("#elan-padlet-reader")
    .evaluate((node) => node.scrollTop);
  expect(draggedScrollTop).toBeGreaterThan(initialScrollTop + 100);

  const card = page.locator(".epr-card", { hasText: "Nouvelle rentree" });
  await expect(card.locator("img")).toHaveCount(0);
  const pdfLink = card.locator(
    ".epr-links a[href$='documents/rentree-2026.pdf']",
  );
  const externalLink = card.locator(
    ".epr-links a[href='https://www.carnould.com/']",
  );
  await expect(pdfLink).toContainText("PDF - Guide PDF de la rentree");
  await expect(pdfLink.locator(".bi-download")).toHaveCount(1);
  await expect(pdfLink.locator(".bi-box-arrow-up-right")).toHaveCount(0);
  await expect(externalLink).toHaveText("Site exemple");
  await expect(externalLink.locator(".bi-box-arrow-up-right")).toHaveCount(1);
  await expect(externalLink.locator(".bi-download")).toHaveCount(0);
});

test("laisse le Padlet original cliquable quand le lecteur est masque", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openApp(page);
  await page.evaluate(() => {
    const originalPost = document.querySelector("main article");
    originalPost.addEventListener("click", () => {
      document.body.dataset.originalPostClicked = "true";
    });
  });

  await page.locator('[data-action="toggle-original"]').click();
  await expect(page.locator("#elan-padlet-reader")).toHaveClass(
    /epr-minimized/,
  );
  await expect(page.locator(".epr-hit-surface")).toBeHidden();

  const originalPostBox = await page
    .locator("main article")
    .first()
    .boundingBox();
  expect(originalPostBox).toBeTruthy();
  await page.mouse.click(
    originalPostBox.x + originalPostBox.width / 2,
    originalPostBox.y + originalPostBox.height / 2,
  );

  await expect(page.locator("body")).toHaveAttribute(
    "data-original-post-clicked",
    "true",
  );
});

test("affiche les liens YouTube dans un lecteur integre", async ({ page }) => {
  await openApp(page);

  const card = page.locator(".epr-card", { hasText: "Objets perdus" });
  await expect(card.locator(".epr-youtube-viewer iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/BiUd53UqMis/,
  );
  await expect(
    card.locator(".epr-links a[href^='https://youtu.be/BiUd53UqMis']"),
  ).toHaveText("Des parents dans l'école? Etes-vous sérieux?");
  await expect(
    card.locator(
      "p a[href='https://colleamoi.com/fr_CA/collecte-de-fonds/supporter']",
    ),
  ).toHaveText("https://colleamoi.com/fr_CA/collecte-de-fonds/supporter");

  await card.locator("h2").click();
  await expect(page.locator(".epr-modal")).toBeVisible();
  await expect(
    page.locator(".epr-modal .epr-youtube-viewer iframe"),
  ).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/BiUd53UqMis/);
  await expect(
    page.locator(
      ".epr-modal .epr-links a[href^='https://youtu.be/BiUd53UqMis']",
    ),
  ).toHaveText("Des parents dans l'école? Etes-vous sérieux?");
  await expect(
    page.locator(
      ".epr-modal p a[href='https://colleamoi.com/fr_CA/collecte-de-fonds/supporter']",
    ),
  ).toHaveText("https://colleamoi.com/fr_CA/collecte-de-fonds/supporter");
  const modalSpacing = await page.locator(".epr-modal").evaluate((modal) => {
    const video = modal.querySelector(".epr-youtube-viewer");
    const text = modal.querySelector(".epr-post-text");
    const videoBox = video.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    return Math.round(textBox.top - videoBox.bottom);
  });
  expect(modalSpacing).toBeGreaterThanOrEqual(14);
});

test("affiche les liens Vimeo dans un lecteur integre", async ({ page }) => {
  await openAppWithExtraPost(
    page,
    `
    <article class="post">
      <h2>Video Vimeo</h2>
      <p>mercredi 2 septembre 2026</p>
      <p>Une capsule video Vimeo pour les parents.</p>
      <p><a href="https://vimeo.com/123456789/abcdef12">Capsule Vimeo</a></p>
    </article>
  `,
  );

  const card = page.locator(".epr-card", { hasText: "Video Vimeo" });
  await expect(card.locator(".epr-video-viewer iframe")).toHaveAttribute(
    "src",
    /player\.vimeo\.com\/video\/123456789\?h=abcdef12/,
  );
  await expect(
    card.locator(".epr-links a[href='https://vimeo.com/123456789/abcdef12']"),
  ).toHaveText("Capsule Vimeo");

  await card.locator("h2").click();
  await expect(page.locator(".epr-modal")).toBeVisible();
  await expect(
    page.locator(".epr-modal .epr-video-viewer iframe"),
  ).toHaveAttribute("src", /player\.vimeo\.com\/video\/123456789\?h=abcdef12/);
  await expect(
    page.locator(
      ".epr-modal .epr-links a[href='https://vimeo.com/123456789/abcdef12']",
    ),
  ).toHaveText("Capsule Vimeo");
});

test("transforme les adresses courriel du texte en liens mailto", async ({
  page,
}) => {
  await openAppWithExtraPost(
    page,
    `
    <article class="post">
      <h2>Contact courriel</h2>
      <p>mercredi 2 septembre 2026</p>
      <p>Pour repondre, ecrivez a secretariat.ecole@example.com. Merci!</p>
    </article>
  `,
  );

  const card = page.locator(".epr-card", { hasText: "Contact courriel" });
  await expect(
    card.locator("p a[href='mailto:secretariat.ecole@example.com']"),
  ).toHaveText("secretariat.ecole@example.com");
  await expect(
    card.locator("p a[href='mailto:secretariat.ecole@example.com']"),
  ).not.toHaveAttribute("target", "_blank");

  await card.locator("h2").click();
  await expect(
    page.locator(".epr-modal p a[href='mailto:secretariat.ecole@example.com']"),
  ).toHaveText("secretariat.ecole@example.com");
});

test("masque les placeholders Vide ou Empty dans tous les posts", async ({
  page,
}) => {
  await openAppWithExtraPost(
    page,
    `
    <article class="post">
      <h2>Message sans placeholder</h2>
      <p>mercredi 26 aout 2026</p>
      <p>empty</p>
      <p>Vide</p>
    </article>
  `,
  );

  const card = page.locator(".epr-card", {
    hasText: "Message sans placeholder",
  });
  await expect(card.locator("h2")).toHaveText("Message sans placeholder");
  await expect(card).not.toContainText("empty");
  await expect(card).not.toContainText("Vide");

  await card.locator("h2").click();
  await expect(page.locator(".epr-modal h2")).toHaveText(
    "Message sans placeholder",
  );
  await expect(page.locator(".epr-modal")).not.toContainText("empty");
  await expect(page.locator(".epr-modal")).not.toContainText("Vide");
});

test("attribue aux sections des couleurs stables et lisibles", async ({
  page,
}) => {
  await openApp(page);

  const firstPass = await page
    .locator(".epr-section-badge")
    .evaluateAll((badges) => {
      function rgb(value) {
        const color = String(value || "").trim();
        if (color.startsWith("#")) {
          return [1, 3, 5].map((start) =>
            Number.parseInt(color.slice(start, start + 2), 16),
          );
        }
        const channels = color.match(/\d+/g);
        if (!channels) throw new Error(`Unsupported color value: ${color}`);
        return channels.slice(0, 3).map(Number);
      }
      function luminance(channels) {
        const [r, g, b] = channels.map((channel) => {
          const value = channel / 255;
          return value <= 0.03928
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      function contrast(first, second) {
        const a = luminance(first);
        const b = luminance(second);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }

      return badges.map((badge) => {
        const style = getComputedStyle(badge);
        const background =
          style.getPropertyValue("--epr-section-bg").trim() ||
          style.backgroundColor;
        const color =
          style.getPropertyValue("--epr-section-fg").trim() || style.color;
        return {
          label: badge.textContent.trim(),
          background,
          color,
          contrast: contrast(rgb(background), rgb(color)),
        };
      });
    });

  expect(firstPass.length).toBeGreaterThan(0);
  for (const badge of firstPass) {
    expect(badge.contrast).toBeGreaterThanOrEqual(4.5);
  }

  const colorsBySection = new Map();
  for (const badge of firstPass) {
    const previous = colorsBySection.get(badge.label);
    const current = `${badge.background}|${badge.color}`;
    if (previous) expect(current).toBe(previous);
    colorsBySection.set(badge.label, current);
  }

  await page.reload();
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();

  const secondPass = await page
    .locator(".epr-section-badge")
    .evaluateAll((badges) => {
      return badges.map((badge) => {
        const style = getComputedStyle(badge);
        const background =
          style.getPropertyValue("--epr-section-bg").trim() ||
          style.backgroundColor;
        const color =
          style.getPropertyValue("--epr-section-fg").trim() || style.color;
        return [badge.textContent.trim(), `${background}|${color}`];
      });
    });

  for (const [label, colors] of secondPass) {
    expect(colors).toBe(colorsBySection.get(label));
  }
});

test("ouvre un modal, navigue au clavier et ferme avec echap", async ({
  page,
}) => {
  await openApp(page);
  await openCard(page, "Nouvelle rentree");

  await expect(page.locator(".epr-modal h2")).toHaveText("Nouvelle rentree");
  await expect(page).toHaveURL(/uglyPost=/);

  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".epr-modal h2")).toHaveText(
    "GS - Sortie mediatheque",
  );
  await expect(page).toHaveURL(/uglyPost=/);

  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".epr-modal h2")).toHaveText("Nouvelle rentree");

  await page.keyboard.press("Escape");
  await expect(page.locator(".epr-modal")).toHaveCount(0);
  await expect(page).not.toHaveURL(/uglyPost=/);
});

test("navigue entre publications par swipe Hammer.js au format mobile", async ({
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

  await swipeModal(page, "left");
  await expect(page.locator(".epr-modal h2")).toHaveText(
    "GS - Sortie mediatheque",
  );

  await swipeModal(page, "right");
  await expect(page.locator(".epr-modal h2")).toHaveText("Nouvelle rentree");
});

test("rouvre le modal correspondant apres rafraichissement de l'URL profonde", async ({
  page,
}) => {
  await openApp(page);
  await openCard(page, "Nouvelle rentree");
  const deepLink = page.url();

  await page.reload();
  await expect(page).toHaveURL(deepLink);
  await expect(page.locator(".epr-modal")).toBeVisible();
  await expect(page.locator(".epr-modal h2")).toHaveText("Nouvelle rentree");

  await page.locator(".epr-modal-next").click();
  await expect(page.locator(".epr-modal h2")).toHaveText(
    "GS - Sortie mediatheque",
  );
  expect(page.url()).not.toBe(deepLink);

  await page.locator(".epr-modal-close").click();
  await expect(page.locator(".epr-modal")).toHaveCount(0);
  await expect(page).not.toHaveURL(/uglyPost=/);
});

test("utilise le chemin du Padlet courant pour les liens profonds", async ({
  page,
}) => {
  await openApp(
    page,
    `${pageUrl}?boardPath=${encodeURIComponent(
      "/garnierc2/2026-2027-fypgw42ks7mvh08g",
    )}`,
  );
  await openCard(page, "PV 16 juin 2025 Fondation");

  await expect(page).toHaveURL(
    /\/garnierc2\/2026-2027-fypgw42ks7mvh08g\/wish\/YBI3Z2xXJdg8av16/,
  );
});

test("affiche les PDF dans un viewer avec les informations de publication", async ({
  page,
}) => {
  await openApp(page);
  await openCard(page, "PV 16 juin 2025 Fondation");

  const panel = page.locator(".epr-modal-panel-pdf");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".epr-modal-header")).toBeVisible();
  await expect(panel.locator("h2")).toHaveText("PV 16 juin 2025 Fondation");
  await expect(panel.locator(".epr-card-meta")).toContainText("16 juin 2025");

  const frame = panel.locator("iframe");
  await expect(frame).toHaveAttribute("data-pdf-source", /\/wish\//);
  const frameBox = await frame.boundingBox();
  expect(frameBox.height).toBeGreaterThan(360);
  await expect(panel).not.toContainText("130 / 196");
  await expect(panel).not.toContainText("Details Padlet");
});

test("affiche et navigue le carousel photo dans le modal", async ({ page }) => {
  await openApp(page);
  const card = page.locator(".epr-card", { hasText: "Album photos" });
  await expect(card.locator(".epr-images img")).toHaveCount(3);
  await expect(card.locator(".epr-links a")).toHaveCount(0);

  await openCard(page, "Album photos");

  await expect(page.locator(".epr-gallery-count")).toHaveText("1 / 3");
  await expect(page.locator(".epr-modal .epr-links a")).toHaveCount(0);
  await page.locator(".epr-gallery-next").click();
  await expect(page.locator(".epr-gallery-count")).toHaveText("2 / 3");
  await page.locator(".epr-gallery-prev").click();
  await expect(page.locator(".epr-gallery-count")).toHaveText("1 / 3");
});

test("ignore les gros conteneurs fusionnes et le chrome Padlet", async ({
  page,
}) => {
  await openApp(page);

  await expect(
    page.locator(".epr-card", {
      hasText: "Appuyez sur Echap pour quitter cette fenetre",
    }),
  ).toHaveCount(0);
  await expect(
    page.locator(".epr-card", {
      hasText: "Mot de la direction Ultimate Frisbee",
    }),
  ).toHaveCount(0);
  await expect(page.locator(".epr-card")).toHaveCount(11);
});
