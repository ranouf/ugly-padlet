const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const pageUrl = "/ugly-padlet-test.html";

async function clearUglyPadletStorage(page) {
  await page.goto(pageUrl);
  await page.evaluate(() => localStorage.clear());
  await page.goto("about:blank");
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

function commentsPayload({ includeEditable = true } = {}) {
  const data = [
    {
      id: "comment_1",
      attributes: {
        id: 1,
        html_body: "<p>Merci pour le partage.</p>",
        author_name: "Parent test",
        user_hashid: "user_parent_test",
        created_at: "2026-09-04T12:00:00.000Z",
      },
    },
  ];

  if (includeEditable) {
    data.push({
      id: "comment_3",
      attributes: {
        id: 3,
        html_body: "<p>Je peux modifier celui-ci.</p>",
        author_name: "Moi",
        created_at: "2026-09-04T12:30:00.000Z",
        can_edit: true,
        can_delete: true,
      },
    });
  }

  return { data, meta: { is_first_page: true, next: null } };
}

async function openApp(page, url = pageUrl, expectedCount = 11) {
  await mockPadletComments(page);
  await page.goto(url);
  await expect(page.locator("#elan-padlet-reader")).toBeVisible();
  await expect(page.locator(".epr-card")).toHaveCount(expectedCount);
}

async function mockPadletComments(page) {
  if (page.__uglyPadletCommentsMocked) return;
  page.__uglyPadletCommentsMocked = true;

  await page.route("https://padlet.com/api/9/comments**", (route) => {
    const queuedPayloads = page.__uglyPadletCommentPayloads;
    const payload = Array.isArray(queuedPayloads)
      ? queuedPayloads.shift() || commentsPayload()
      : commentsPayload();
    route.fulfill({
      status: 200,
      contentType: "application/vnd.api+json; charset=utf-8",
      body: JSON.stringify(payload),
    });
  });

  await page.route("https://padlet.com/api/8/comments", (route) => {
    const requestBody = route.request().postDataJSON();
    route.fulfill({
      status: 200,
      contentType: "application/vnd.api+json; charset=utf-8",
      body: JSON.stringify({
        data: {
          id: "comment_2",
          attributes: {
            id: 2,
            html_body: requestBody.attributes.html_body,
            author_name: "Moi",
            created_at: "2026-09-04T13:00:00.000Z",
          },
        },
      }),
    });
  });

  await page.route("https://padlet.com/api/8/comments/3", (route) => {
    const requestBody = route.request().postDataJSON();
    route.fulfill({
      status: 200,
      contentType: "application/vnd.api+json; charset=utf-8",
      body: JSON.stringify({
        data: {
          id: "comment_3",
          attributes: {
            id: 3,
            html_body: requestBody.attributes.html_body,
            author_name: "Moi",
            created_at: "2026-09-04T12:30:00.000Z",
            can_edit: true,
            can_delete: true,
          },
        },
      }),
    });
  });

  await page.route("https://padlet.com/api/5/comments/3", (route) => {
    route.fulfill({
      status: 204,
      contentType: "application/vnd.api+json; charset=utf-8",
      body: "",
    });
  });
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
  await page.locator(".epr-modal").evaluate((modal, direction) => {
    const box = modal.getBoundingClientRect();
    const y = box.top + box.height * 0.82;
    const startX = box.left + box.width * (direction === "left" ? 0.82 : 0.18);
    const endX = box.left + box.width * (direction === "left" ? 0.18 : 0.82);
    const points = [
      startX,
      startX + (endX - startX) * 0.35,
      startX + (endX - startX) * 0.7,
      endX,
    ];

    modal.dispatchEvent(
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
      modal.dispatchEvent(
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

    modal.dispatchEvent(
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

test("affiche les actions newsletter et actualisation dans l'entete", async ({
  page,
}) => {
  await openApp(page);

  const refresh = page.locator('[data-action="rescan"]');
  await expect(refresh).toHaveAttribute(
    "aria-label",
    "Actualiser les communications",
  );
  await expect(refresh.locator(".bi-arrow-counterclockwise")).toBeVisible();

  const newsletter = page.locator('[data-action="open-newsletter"]');
  await expect(newsletter).toHaveAttribute(
    "href",
    /https:\/\/padlet\.com\/auth\/signup\?referrer=http%3A%2F%2F127\.0\.0\.1%3A4173%2Fugly-padlet-test\.html/,
  );
  await expect(newsletter.locator(".bi-bell-plus")).toBeVisible();

  const padlet = page.locator('[data-action="toggle-original"]');
  await expect(padlet).toHaveAttribute("aria-label", "Voir le Padlet original");
  await expect(padlet.locator(".epr-padlet-icon")).toBeVisible();
  await expect(padlet.locator(".epr-padlet-icon")).toHaveCSS(
    "background-image",
    /data:image\/png;base64/,
  );
  await expect(padlet).toHaveText("");
});

test("indique lorsqu une nouvelle version de l extension est disponible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.chrome = {
      runtime: {
        getManifest: () => ({ version: "2.0.29" }),
      },
      storage: {
        local: {
          get: (_key, callback) => {
            callback({});
          },
        },
        onChanged: {
          addListener: (listener) => {
            window.__uglyPadletUpdateListener = listener;
          },
        },
      },
    };
  });
  await openApp(page);

  const indicator = page.locator(".epr-update-available");
  await expect(indicator).toBeHidden();
  await page.evaluate(() => {
    window.__uglyPadletUpdateListener(
      {
        uglyPadletUpdateAvailable: {
          newValue: { version: "2.0.30" },
        },
      },
      "local",
    );
  });
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveAttribute(
    "title",
    /Une nouvelle version d'UglyPadlet \(v2\.0\.30\) est disponible/,
  );
  await expect(indicator.locator(".bi-arrow-up-circle")).toBeVisible();
});

test("affiche le cache immediatement puis actualise en arriere-plan", async ({
  page,
}) => {
  await openApp(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(localStorage.getItem("uglyPadlet:ecoleElan:posts:v5")),
      ),
    )
    .toBe(true);

  await page.addInitScript(() => {
    const observedProgress = new Set();
    const observer = new MutationObserver(() => {
      const refresh = document.querySelector('[data-action="rescan"]');
      if (
        refresh?.getAttribute("aria-busy") === "true" &&
        document.documentElement.dataset.refreshObserved !== "true"
      ) {
        document.documentElement.dataset.refreshObserved = "true";
      }
      const progress = Number.parseFloat(
        refresh?.style.getPropertyValue("--epr-refresh-progress") || "0",
      );
      if (
        progress > 0 &&
        progress < 100 &&
        document.documentElement.dataset.refreshProgressObserved !== "true"
      ) {
        document.documentElement.dataset.refreshProgressObserved = "true";
      }
      if (progress > 0 && progress < 100) {
        observedProgress.add(Math.round(progress));
        const steps = String(observedProgress.size);
        if (document.documentElement.dataset.refreshProgressSteps !== steps) {
          document.documentElement.dataset.refreshProgressSteps = steps;
        }
      }
      if (
        progress === 100 &&
        refresh?.classList.contains("epr-refresh-complete") &&
        document.documentElement.dataset.refreshCompletionObserved !== "true"
      ) {
        document.documentElement.dataset.refreshCompletionObserved = "true";
      }
    });
    observer.observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });

  await page.reload();

  await expect(page.locator(".epr-card")).toHaveCount(11);
  await expect(page.locator(".epr-summary")).toContainText("11 communications");
  await expect(page.locator(".epr-summary")).not.toContainText(
    "Depuis le cache",
  );
  await expect(page.locator("#elan-padlet-reader")).not.toHaveClass(
    /epr-boot-loading/,
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-refresh-observed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-refresh-progress-observed",
    "true",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-refresh-completion-observed",
    "true",
  );
  expect(
    await page
      .locator("html")
      .evaluate((node) => Number(node.dataset.refreshProgressSteps || 0)),
  ).toBeGreaterThan(4);
});

test("ignore un cache provenant du DOM qui contient une date incorrecte", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const staleDate = "2027-04-21T04:00:00.000Z";
    localStorage.setItem(
      "uglyPadlet:ecoleElan:posts:v5",
      JSON.stringify({
        source: "dom",
        savedAt: new Date().toISOString(),
        posts: [
          {
            id: "stale-dom-post",
            index: 0,
            title: "Communication erronée du 21 avril",
            text: "Communication erronée du 21 avril",
            isSeparator: false,
            section: "Non classée",
            date: staleDate,
            dates: [staleDate],
            dateKey: "2027-4-21",
            publishedAt: staleDate,
            links: [],
            images: [],
          },
        ],
      }),
    );
  });

  await openApp(page);

  await expect(
    page.locator(".epr-card", {
      hasText: "Communication erronée du 21 avril",
    }),
  ).toHaveCount(0);
  await expect(page.locator(".epr-card")).toHaveCount(11);
});

test("ne melange pas une date DOM au cache API pendant la synchronisation", async ({
  page,
}) => {
  const fixture = fs.readFileSync(
    path.join(__dirname, "..", "ugly-padlet-test.html"),
    "utf8",
  );
  const publishedAt = "2026-04-21T00:09:18.720Z";

  await page.addInitScript(
    ({ cacheKey, publicationDate }) => {
      window.__uglyPadletStartingState = {
        wall: { is_commentable: false },
      };
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          source: "api",
          savedAt: new Date().toISOString(),
          posts: [
            {
              id: "padlet-post_MxrmZYBxKArLWGOq",
              index: 0,
              title: "Rappel",
              text: "Rappel\n\nJournée tapis rouge demain, 21 avril.",
              isSeparator: false,
              section: "École",
              urlSlug: "MxrmZYBxKArLWGOq",
              date: "2026-04-20T04:00:00.000Z",
              dates: ["2027-04-21T04:00:00.000Z"],
              dateKey: "2026-4-21",
              publishedAt: publicationDate,
              links: [],
              images: [],
            },
          ],
        }),
      );
    },
    {
      cacheKey: "uglyPadlet:ecoleElan:posts:v5",
      publicationDate: publishedAt,
    },
  );

  await page.route(
    "**/ugly-padlet-test.html?api-test=transient-date",
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: fixture
          .replace("<body>", '<body data-wall="board_DateSorting123">')
          .replace(
            "</main>",
            `<article class="post">
              <h2>Rappel</h2>
              <p>Journée tapis rouge demain, 21 avril.</p>
            </article>
            </main>`,
          ),
      });
    },
  );
  await page.route("https://padlet.com/api/10/wishes**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.api+json; charset=utf-8",
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:4173",
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify({
        data: [
          {
            id: "3876314215",
            attributes: {
              id: 3876314215,
              hashid: "post_MxrmZYBxKArLWGOq",
              subject: "Rappel",
              body: "Journée tapis rouge demain, 21 avril.",
              published_at: publishedAt,
              created_at: publishedAt,
            },
          },
        ],
        meta: { next: null },
      }),
    });
  });

  await page.goto(`${pageUrl}?api-test=transient-date`);
  await expect(page.locator(".epr-summary")).toHaveText("1 communication.");
  await expect(page.locator(".epr-summary")).not.toContainText(
    /Recherche|Chargement|cache|publication trouvée/i,
  );
  await page.waitForTimeout(900);

  const card = page.locator(".epr-card", { hasText: "Rappel" });
  await expect(card).toHaveCount(1);
  await expect(card.locator(".epr-date-badge")).toContainText(
    "lundi 20 avril 2026",
  );
  await expect(page.locator("#elan-padlet-reader")).toHaveAttribute(
    "data-load-source",
    "api",
  );
});

test("masque les publications sans contenu utilisees comme titres Padlet", async ({
  page,
}) => {
  await page.route("**/ugly-padlet-test.html?separator=1", async (route) => {
    const response = await route.fetch();
    const fixture = await response.text();
    await route.fulfill({
      response,
      body: fixture.replace(
        "</main>",
        `
        <article class="post">
          <h2>Communications de l'equipe-ecole</h2>
        </article>
        </main>`,
      ),
    });
  });
  await openApp(page, `${pageUrl}?separator=1`);

  await expect(page.locator(".epr-summary")).toContainText("11 communications");
  await expect(page.locator(".epr-card")).toHaveCount(11);
  await expect(page.locator("#elan-padlet-reader")).not.toContainText(
    "Communications de l'equipe-ecole",
  );
});

test("conserve les publications avec image meme sans texte", async ({
  page,
}) => {
  await page.route("**/ugly-padlet-test.html?image-only=1", async (route) => {
    const response = await route.fetch();
    const fixture = await response.text();
    await route.fulfill({
      response,
      body: fixture.replace(
        "</main>",
        `
        <article class="post">
          <h2>Photo de classe</h2>
          <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'%3E%3Crect width='1200' height='800' fill='%232f5f6f'/%3E%3Ctext x='600' y='430' font-size='80' text-anchor='middle' fill='white'%3EPhoto%3C/text%3E%3C/svg%3E" alt="">
        </article>
        </main>`,
      ),
    });
  });

  await openApp(page, `${pageUrl}?image-only=1`, 12);
  const card = page.locator(".epr-card", { hasText: "Photo de classe" });
  await expect(card).toBeVisible();
  await expect(card.locator(".epr-images img")).toHaveCount(1);
  await openCard(page, "Photo de classe");
  await expect(page.locator(".epr-modal .epr-images img")).toHaveCount(1);
});

test("propose l'ajout des dates detectees aux calendriers", async ({
  page,
}) => {
  await page.route("**/ugly-padlet-test.html?calendar=1", async (route) => {
    const response = await route.fetch();
    const fixture = await response.text();
    await route.fulfill({
      response,
      body: fixture.replace(
        "</main>",
        `
        <article class="post">
          <h2>Horaires des sorties et activites</h2>
          <p>lundi 7 septembre: Fete du travail</p>
          <p>mercredi 16 septembre a 18h30: rencontre de la communaute</p>
        </article>
        </main>`,
      ),
    });
  });
  await openApp(page, `${pageUrl}?calendar=1`, 12);

  const card = page.locator(".epr-card", {
    hasText: "Horaires des sorties et activites",
  });
  await expect(card.locator(".epr-calendar-event")).toHaveCount(2);

  const firstEvent = card.locator(".epr-calendar-event", {
    hasText: "lundi 7 septembre",
  });
  await expect(firstEvent.locator(".epr-calendar-trigger")).toHaveAttribute(
    "aria-label",
    /Ajouter lundi 7 septembre a l'agenda/,
  );
  await expect(firstEvent.locator(".epr-calendar-separator")).toHaveText(":");
  await expect(firstEvent.locator(".epr-icon-calendar-plus")).toHaveCount(1);
  await expect(firstEvent).toHaveCSS("cursor", "pointer");
  await expect(firstEvent.locator(".epr-calendar-menu")).toBeHidden();
  await firstEvent.hover();
  await expect(firstEvent.locator(".epr-calendar-trigger")).toBeVisible();
  await expect(firstEvent.locator(".epr-calendar-menu")).toBeHidden();
  await firstEvent.locator(".epr-calendar-trigger").click();
  await expect(firstEvent.locator(".epr-calendar-trigger")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(firstEvent.locator(".epr-calendar-menu")).toBeVisible();
  await expect(firstEvent.locator(".epr-calendar-menu a")).toHaveText([
    "Google Calendar",
    "Outlook",
    "Apple Calendar",
    "Fichier .ics",
  ]);
  await expect(firstEvent.locator(".epr-calendar-menu .epr-icon")).toHaveCount(
    4,
  );
  await expect(firstEvent.locator(".epr-icon-google")).toHaveCount(1);
  await expect(firstEvent.locator(".epr-icon-microsoft")).toHaveCount(1);
  await expect(firstEvent.locator(".epr-icon-apple")).toHaveCount(1);
  await expect(firstEvent.locator(".epr-icon-calendar-event")).toHaveCount(1);
  await expect(
    firstEvent.locator(".epr-calendar-menu a", { hasText: "Google Calendar" }),
  ).toHaveAttribute("href", /calendar\.google\.com\/calendar\/render/);
  const popupPromise = page.waitForEvent("popup");
  await firstEvent
    .locator(".epr-calendar-menu a", { hasText: "Google Calendar" })
    .click();
  const popup = await popupPromise;
  expect(popup.url()).toContain("calendar.google.com/calendar/render");
  await popup.close();
  await expect(
    firstEvent.locator(".epr-calendar-menu a", { hasText: "Apple Calendar" }),
  ).toHaveAttribute(
    "download",
    /horaires-des-sorties-et-activites-20250907\.ics/,
  );

  const timedEvent = card.locator(".epr-calendar-event", {
    hasText: "mercredi 16 septembre",
  });
  await timedEvent.locator(".epr-calendar-trigger").click();
  await expect(
    timedEvent.locator(".epr-calendar-menu a", { hasText: "Outlook" }),
  ).toHaveAttribute("href", /startdt=2025-09-16T/);
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

test("affiche une progression graduelle pendant le chargement API initial", async ({
  page,
}) => {
  const fixture = fs.readFileSync(
    path.join(__dirname, "..", "ugly-padlet-test.html"),
    "utf8",
  );

  await page.addInitScript(() => {
    window.__uglyPadletStartingState = {
      wall: { is_commentable: false },
    };
    const observed = new Set();
    const observer = new MutationObserver(() => {
      const value = Number.parseInt(
        document.querySelector(".epr-loader-percent")?.textContent || "",
        10,
      );
      if (value > 0 && value < 100) {
        observed.add(value);
        document.documentElement.dataset.apiProgressSteps = String(
          observed.size,
        );
      }
      if (value === 100) {
        document.documentElement.dataset.apiProgressComplete = "true";
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.route("**/ugly-padlet-test.html?api-test=progress", (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixture.replace("<body>", '<body data-wall="board_Progress123">'),
    });
  });
  await page.route("https://padlet.com/api/10/wishes**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.api+json; charset=utf-8",
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:4173",
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify({
        data: [
          {
            id: "progress-post",
            attributes: {
              id: 1,
              hashid: "post_progress",
              subject: "Publication chargée progressivement",
              body: "Contenu reçu depuis l'API Padlet.",
              published_at: "2026-09-10T12:00:00.000Z",
            },
          },
        ],
        meta: { next: null },
      }),
    });
  });
  await page.route("https://padlet.com/api/5/wall_sections**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/vnd.api+json; charset=utf-8",
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.goto(`${pageUrl}?api-test=progress`);
  await expect(page.locator(".epr-loader")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".epr-loader-percent")
        .evaluate((node) => Number.parseInt(node.textContent || "", 10)),
    )
    .toBeGreaterThan(8);
  await expect(page.locator("#elan-padlet-reader")).toHaveAttribute(
    "data-load-source",
    "api",
  );
  expect(
    await page
      .locator("html")
      .evaluate((node) => Number(node.dataset.apiProgressSteps || 0)),
  ).toBeGreaterThan(4);
  await expect(page.locator("html")).toHaveAttribute(
    "data-api-progress-complete",
    "true",
  );
  await expect(page.locator(".epr-loader")).toBeHidden();
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
  const recentDate = new Intl.DateTimeFormat("fr-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  await openAppWithExtraPost(
    page,
    `
    <article class="post">
      <h2>Nouvelle publication de test</h2>
      <p>${recentDate}</p>
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
  await expect(page.locator(".epr-version")).toHaveText("UglyPadlet v2.0.29");
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
  await expect(
    page.locator('[data-action="toggle-original"] .bi-arrow-left'),
  ).toBeVisible();
  await expect(page.locator('[data-action="toggle-original"]')).toContainText(
    "Revenir au lecteur",
  );
  await expect(page.locator('[data-action="open-newsletter"]')).toBeHidden();
  await expect(page.locator(".epr-hit-surface")).toBeHidden();

  await page.locator("main article").first().click();

  await expect(page.locator("body")).toHaveAttribute(
    "data-original-post-clicked",
    "true",
  );
});

test("masque les commentaires quand le Padlet original les desactive", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__uglyPadletStartingState = { wall: { is_commentable: false } };
  });

  await openApp(page);
  await openCard(page, "PV 16 juin 2025 Fondation");

  await expect(page.locator("#elan-padlet-reader")).toHaveAttribute(
    "data-wall-commentable",
    "false",
  );
  await expect(page.locator(".epr-modal .epr-comments-panel")).toHaveCount(0);
  await expect(page.locator(".epr-modal .epr-comment-link")).toHaveCount(0);
});
test("affiche les actions sur mon commentaire sans flag explicite", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__uglyPadletStartingState = {
      wall: { is_commentable: true },
      user: { hashid: "user_parent_test" },
      canIModerate: false,
    };
  });

  await openApp(page);
  await openCard(page, "PV 16 juin 2025 Fondation");

  const myComment = page.locator(".epr-comment").filter({
    hasText: "Merci pour le partage.",
  });
  await expect(myComment.locator("button")).toHaveText([
    "Modifier",
    "Supprimer",
  ]);
});
test("affiche le panneau de commentaires dans le modal seulement quand possible", async ({
  page,
}) => {
  await openApp(page);
  await openCard(page, "Nouvelle rentree");
  await expect(page.locator(".epr-modal .epr-comment-link")).toHaveCount(0);
  await expect(page.locator(".epr-modal .epr-comments-panel")).toHaveCount(0);

  await page.locator(".epr-modal-close").click();
  await openCard(page, "PV 16 juin 2025 Fondation");

  const panel = page.locator(".epr-modal .epr-comments-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".epr-comments-header")).toContainText(
    "Commentaires",
  );
  await expect(panel.locator(".epr-comment").first()).toContainText(
    "Merci pour le partage.",
  );
  await expect(panel.locator("textarea")).toBeVisible();
  await expect(panel.locator(".epr-comment").first()).not.toContainText(
    "Modifier",
  );
  await expect(panel.locator(".epr-comment").first()).not.toContainText(
    "Supprimer",
  );

  const editableComment = panel.locator(".epr-comment").filter({
    hasText: "Je peux modifier celui-ci.",
  });
  await expect(editableComment.locator("button")).toHaveText([
    "Modifier",
    "Supprimer",
  ]);

  await editableComment.locator("button", { hasText: "Modifier" }).click();
  await panel
    .locator(".epr-comment-edit-form textarea")
    .fill("Commentaire modifie depuis le modal.");
  const editRequestPromise = page.waitForRequest(
    "https://padlet.com/api/8/comments/3",
  );
  await panel
    .locator(".epr-comment-edit-form button", {
      hasText: "Enregistrer",
    })
    .click();
  const editRequest = await editRequestPromise;
  expect(editRequest.postDataJSON()).toEqual({
    attributes: {
      html_body: "<p>Commentaire modifie depuis le modal.</p>",
    },
  });
  await expect(
    panel.locator(".epr-comment").filter({
      hasText: "Commentaire modifie depuis le modal.",
    }),
  ).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  const deleteRequestPromise = page.waitForRequest(
    "https://padlet.com/api/5/comments/3",
  );
  await panel
    .locator(".epr-comment")
    .filter({ hasText: "Commentaire modifie depuis le modal." })
    .locator("button", { hasText: "Supprimer" })
    .click();
  await deleteRequestPromise;
  await expect(
    panel.locator(".epr-comment").filter({
      hasText: "Commentaire modifie depuis le modal.",
    }),
  ).toHaveCount(0);

  await panel.locator("textarea").fill("Nouveau commentaire depuis le modal.");
  const requestPromise = page.waitForRequest(
    "https://padlet.com/api/8/comments",
  );
  await panel.locator("button[type='submit']").click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toEqual({
    attributes: {
      wish_id: 4032920406,
      html_body: "<p>Nouveau commentaire depuis le modal.</p>",
      attachment: null,
    },
  });
  await expect(panel.locator(".epr-comment")).toHaveCount(2);
  await expect(panel.locator(".epr-comment").last()).toContainText(
    "Nouveau commentaire depuis le modal.",
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

test("permet de selectionner le texte dans la modale desktop", async ({
  page,
}) => {
  await openApp(page);
  await openCard(page, "Nouvelle rentree");

  const paragraph = page.locator(".epr-modal h2");
  await expect(paragraph).toBeVisible();
  await paragraph.selectText();

  const selectedText = await page.evaluate(() =>
    String(window.getSelection()?.toString() || "").trim(),
  );
  expect(selectedText.length).toBeGreaterThan(0);
  expect(selectedText).toContain("Nouvelle rentree");
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

test("rafraichit les commentaires a chaque ouverture du modal", async ({
  page,
}) => {
  page.__uglyPadletCommentPayloads = [
    commentsPayload(),
    commentsPayload({ includeEditable: false }),
  ];

  await openApp(page);
  await openCard(page, "PV 16 juin 2025 Fondation");

  const panel = page.locator(".epr-modal .epr-comments-panel");
  await expect(
    panel.locator(".epr-comment").filter({
      hasText: "Je peux modifier celui-ci.",
    }),
  ).toBeVisible();

  await page.locator(".epr-modal-close").click();
  await openCard(page, "PV 16 juin 2025 Fondation");

  await expect(
    panel.locator(".epr-comment").filter({
      hasText: "Je peux modifier celui-ci.",
    }),
  ).toHaveCount(0);
  await expect(panel.locator(".epr-comment")).toHaveCount(1);
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
  await expect
    .poll(async () => {
      const box = await frame.boundingBox();
      return box ? Math.round(box.height) : 0;
    })
    .toBeGreaterThan(360);
  await expect(panel).not.toContainText("130 / 196");
  await expect(panel).not.toContainText("Details Padlet");
});

test("affiche une image seule en grand dans le modal", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 820 });
  await page.route("**/ugly-padlet-test.html?single-image=1", async (route) => {
    const response = await route.fetch();
    const fixture = await response.text();
    await route.fulfill({
      response,
      body: fixture.replace(
        "</main>",
        `
        <article class="post">
          <h2>Portrait grand format</h2>
          <p>mardi 1 septembre 2026</p>
          <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='1000'%3E%3Crect width='1200' height='1000' fill='%2347586a'/%3E%3Ctext x='600' y='530' font-size='92' text-anchor='middle' fill='white'%3EPortrait%3C/text%3E%3C/svg%3E" alt="">
        </article>
        </main>`,
      ),
    });
  });
  await openApp(page, `${pageUrl}?single-image=1`, 12);

  const card = page.locator(".epr-card", { hasText: "Portrait grand format" });
  const cardImage = card.locator(".epr-images img");
  await expect(cardImage).toBeVisible();
  const cardImageBox = await cardImage.boundingBox();
  expect(cardImageBox).not.toBeNull();
  expect(cardImageBox.height).toBeLessThanOrEqual(260);

  await openCard(page, "Portrait grand format");
  const modalImage = page.locator(".epr-modal-body .epr-images img");
  await expect(modalImage).toBeVisible();
  const modalImageBox = await modalImage.boundingBox();
  expect(modalImageBox).not.toBeNull();
  expect(modalImageBox.height).toBeGreaterThan(500);
  expect(modalImageBox.width).toBeGreaterThan(600);
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

test("remplace les dates du cache par les dates de publication de l API", async ({
  page,
}) => {
  const fixture = fs.readFileSync(
    path.join(__dirname, "..", "ugly-padlet-test.html"),
    "utf8",
  );
  const staleDate = "2027-06-30T04:00:00.000Z";

  await page.addInitScript(
    ({ cacheKey, date }) => {
      window.__uglyPadletStartingState = {
        wall: { is_commentable: false },
      };
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          source: "api",
          savedAt: new Date().toISOString(),
          posts: [
            {
              id: "stale-mot-direction",
              index: 0,
              title: "Mot de la direction 31 août",
              text: "Mot de la direction 31 août",
              isSeparator: false,
              section: "Communications de la direction",
              urlSlug: "MxrmZYBxKArLWGOq",
              date,
              dates: [date],
              dateKey: "2027-6-30",
              publishedAt: date,
              links: [],
              images: [],
            },
          ],
        }),
      );
    },
    {
      cacheKey: "uglyPadlet:ecoleElan:posts:v5",
      date: staleDate,
    },
  );

  await page.route("**/ugly-padlet-test.html?api-test=1", (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixture.replace(
        "<body>",
        '<body data-wall="board_DateSorting123">',
      ),
    });
  });
  await page.route("https://padlet.com/api/10/wishes**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/vnd.api+json; charset=utf-8",
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:4173",
        "access-control-allow-credentials": "true",
      },
      body: JSON.stringify({
        data: [
          {
            id: "6",
            attributes: {
              id: 6,
              hashid: "post_recent_earlier",
              subject: "Publication récente plus tôt",
              body: "Information publiée plus tôt le même jour",
              published_at: "2026-09-08T15:00:00.000Z",
              created_at: "2026-09-08T15:00:00.000Z",
              updated_at: "2026-09-10T19:00:00.000Z",
            },
          },
          {
            id: "4",
            attributes: {
              id: 4,
              hashid: "post_recent",
              subject: "Publication récente",
              body: "Information récente",
              published_at: "2026-09-08T16:37:44.776Z",
              created_at: "2026-09-08T15:46:00.609Z",
              updated_at: "2026-09-08T16:37:44.779Z",
            },
          },
          {
            id: "3",
            attributes: {
              id: 3,
              hashid: "post_middle",
              subject: "Publication intermédiaire",
              body: "Information intermédiaire",
              published_at: "2026-09-04T22:21:52.152Z",
              created_at: "2026-09-04T22:21:52.152Z",
              updated_at: "2026-09-10T14:28:18.087Z",
            },
          },
          {
            id: "5",
            attributes: {
              id: 5,
              hashid: "post_created_fallback",
              subject: "Publication sans date de publication",
              body: "La date de création sert de repli",
              created_at: "2026-09-03T12:00:00.000Z",
              updated_at: "2026-09-10T18:00:00.000Z",
            },
          },
          {
            id: "2",
            attributes: {
              id: 2,
              hashid: "post_MxrmZYe9zMEdZGOq",
              subject: "Mot de la direction 31 août",
              body: "Communication publiée en septembre 2026",
              published_at: "2026-09-02T15:51:58.605Z",
              created_at: "2026-09-02T15:51:58.626Z",
              updated_at: "2026-09-10T14:32:42.169Z",
            },
          },
          {
            id: "1",
            attributes: {
              id: 1,
              hashid: "post_old_updated",
              subject: "Ancienne publication modifiée",
              body: "Cette publication reste ancienne malgré sa modification",
              published_at: "2025-11-26T14:04:29.380Z",
              created_at: "2025-11-26T14:04:29.380Z",
              updated_at: "2026-09-10T17:43:38.191Z",
            },
          },
        ],
        meta: { next: null },
      }),
    });
  });

  await page.goto(`${pageUrl}?api-test=1`);
  await expect(page.locator("#elan-padlet-reader")).toHaveAttribute(
    "data-load-source",
    "api",
  );
  await expect(page.locator(".epr-card")).toHaveCount(6);
  await expect(page.locator(".epr-card h2")).toHaveText([
    "Publication récente",
    "Publication récente plus tôt",
    "Publication intermédiaire",
    "Publication sans date de publication",
    "Mot de la direction 31 août",
    "Ancienne publication modifiée",
  ]);
  await expect(
    page.locator(".epr-card", { hasText: "Mot de la direction 31 août" }),
  ).toContainText("mercredi 2 septembre 2026");

  const cachedDate = await page.evaluate(() => {
    const cached = JSON.parse(
      localStorage.getItem("uglyPadlet:ecoleElan:posts:v5"),
    );
    return cached.posts.find(
      (post) => post.title === "Mot de la direction 31 août",
    )?.publishedAt;
  });
  expect(cachedDate).toBe("2026-09-02T15:51:58.605Z");
});
