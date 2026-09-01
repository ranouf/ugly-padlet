(() => {
  const APP_ID = "elan-padlet-reader";
  const TARGET_URLS = [
    "padlet.com/elanquoideneuf/ecole-elan-2025-2026-gsult4hljk84tu3a",
    "padlet.com/elanquoideneuf/ecole-elan-2026-2027-gsult4hljk84tu3a"
  ];
  const TEST_PAGE = "ugly-padlet-test.html";
  const CACHE_KEY = "uglyPadlet:ecoleElan:posts:v3";
  const FILTER_CACHE_KEY = "uglyPadlet:ecoleElan:filters:v1";
  const CACHE_ENABLED = false;
  const APP_VERSION = getExtensionVersion("1.0.82");
  const STATUS_OPTIONS = [
    ["all", "Toutes"],
    ["upcoming", "A venir"],
    ["past", "Deja passees"]
  ];
  const TODAY = startOfDay(new Date());
  const MONTHS = new Map([
    ["janvier", 0], ["janv", 0], ["fevrier", 1], ["fevr", 1], ["février", 1], ["févr", 1],
    ["mars", 2], ["avril", 3], ["avr", 3], ["mai", 4], ["juin", 5], ["juillet", 6],
    ["juil", 6], ["aout", 7], ["août", 7], ["septembre", 8], ["sept", 8],
    ["octobre", 9], ["oct", 9], ["novembre", 10], ["nov", 10], ["decembre", 11],
    ["dec", 11], ["décembre", 11], ["déc", 11]
  ]);
  const SECTION_KEYWORDS = [
    "TPS", "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2",
    "Maternelle", "Elementaire", "Élémentaire", "Primaire", "Ecole", "École",
    "Cantine", "Garderie", "Periscolaire", "Périscolaire", "Sortie", "Parents"
  ];
  const BOARD_SECTION_TITLES = [
    "Mot de la direction",
    "Mot des comites",
    "Mot des comités",
    "Mot des enseignant.e.s",
    "Documents de reference ecole",
    "Documents de référence école",
    "Bulletins, Plans d'intervention (PI) et ressources pedagogiques",
    "Bulletins, Plans d’intervention (PI) et ressources pédagogiques",
    "Sante et securite",
    "Santé et sécurité",
    "Service de garde",
    "Implication parentale",
    "Babillard des parents",
    "Conseil d'etablissement",
    "Conseil d'établissement",
    "Fondation",
    "Le coin des specialistes",
    "Le coin des spécialistes",
    "Personnel de l'ecole",
    "Personnel de l'école",
    "Avis public CA du CSSDM",
    "Rentree 2026",
    "Rentrée 2026"
  ];

  if ((!TARGET_URLS.some((targetUrl) => location.href.includes(targetUrl)) && !location.href.includes(TEST_PAGE)) || document.getElementById(APP_ID)) return;
  const activeTargetUrl = TARGET_URLS.find((targetUrl) => location.href.includes(targetUrl)) || TARGET_URLS[0];
  const BOARD_PATH = location.href.includes(TEST_PAGE) ? location.pathname : new URL(`https://${activeTargetUrl}`).pathname;
  const USE_PADLET_WISH_URLS = !location.href.includes(TEST_PAGE);
  const padletTitle = getPadletTitle();

  const state = {
    posts: [],
    postMap: new Map(),
    query: "",
    status: "all",
    sections: [],
    from: "",
    to: "",
    showOriginal: false,
    lastSignature: "",
    isLoadingAll: false,
    isCheckingRecent: false,
    loadMessage: "",
    loadProgress: {
      found: 0,
      total: 0,
      percent: 0,
      round: 0,
      maxRounds: 0,
      stableRounds: 0
    },
    cacheLoaded: false,
    loadedFromApi: false,
    pendingSections: [],
    cachedLatestDate: null,
    visiblePosts: [],
    modalIndex: -1,
    modalImageIndex: 0,
    pendingModalRequest: readModalRequestFromUrl()
  };
  const pdfResolverCache = new Map();

  const root = document.createElement("div");
  root.id = APP_ID;
  applyOriginalBackground(root);
  root.innerHTML = `
    <div class="epr-hit-surface" aria-hidden="true"></div>
    <div class="epr-shell">
      <header class="epr-header">
        <div>
          <p class="epr-kicker">Padlet de l'ecole</p>
          <h1>${escapeHtml(padletTitle)}</h1>
        </div>
        <div class="epr-actions">
          <button type="button" data-action="rescan">Actualiser</button>
          <button type="button" data-action="toggle-original" aria-pressed="false">Voir Padlet</button>
        </div>
      </header>

      <section class="epr-filters" aria-label="Filtres">
        <label>
          <span>Recherche</span>
          <input type="search" data-filter="query" placeholder="Mot, sortie, classe..." autocomplete="off" />
        </label>
        <label>
          <span>Communication</span>
          <div class="epr-single-select" data-status-filter>
            <button type="button" class="epr-single-select-toggle" data-action="toggle-status-menu" aria-haspopup="true" aria-expanded="false">
              <span class="epr-status-filter-label">Toutes</span>
              ${renderIcon("chevron-down")}
            </button>
            <div class="epr-single-select-menu" hidden>
              ${STATUS_OPTIONS.map(([value, label]) => `
                <button type="button" class="epr-single-select-option" data-action="set-status" data-status-value="${escapeHtml(value)}" role="menuitemradio" aria-checked="false">
                  <span>${escapeHtml(label)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </label>
        <label>
          <span>Section</span>
          <div class="epr-multi-select" data-section-filter>
            <button type="button" class="epr-multi-select-toggle" data-action="toggle-section-menu" aria-haspopup="true" aria-expanded="false">
              <span class="epr-section-filter-label">Toutes les sections</span>
              ${renderIcon("chevron-down")}
            </button>
            <div class="epr-multi-select-menu" hidden>
              <button type="button" class="epr-multi-select-option" data-action="clear-sections">
                <span class="epr-checkbox-mark" aria-hidden="true"></span>
                <span>Toutes les sections</span>
              </button>
            </div>
          </div>
        </label>
        <label>
          <span>Du</span>
          <input type="date" data-filter="from" autocomplete="off" />
        </label>
        <label>
          <span>Au</span>
          <input type="date" data-filter="to" autocomplete="off" />
        </label>
        <div class="epr-filter-reset">
          <span aria-hidden="true"></span>
          <button type="button" data-action="reset-filters" aria-label="Reinitialiser les filtres" title="Reinitialiser les filtres">
            ${renderIcon("arrow-counterclockwise")}
          </button>
        </div>
        <div class="epr-summary" aria-live="polite"></div>
      </section>

      <main>
        <section class="epr-loader" aria-live="polite" aria-label="Chargement des communications">
          <div class="epr-loader-ring" aria-hidden="true">
            <span class="epr-loader-percent">0%</span>
          </div>
          <div>
            <h2>Chargement des communications</h2>
            <p class="epr-loader-found">0 communication trouvee</p>
            <p class="epr-loader-detail">Balayage du Padlet en cours...</p>
          </div>
        </section>
        <div class="epr-list"></div>
      </main>

      <footer class="epr-credits" aria-label="Contact">
        <a href="mailto:uglypadlet@carnould.com">Suggestion ou bug : uglypadlet@carnould.com</a>
        <span class="epr-version" aria-label="Version de l'extension">UglyPadlet v${escapeHtml(APP_VERSION)}</span>
      </footer>
      <div class="epr-scrollbar" data-custom-scrollbar aria-hidden="true" hidden>
        <div class="epr-scrollbar-thumb" data-custom-scrollbar-thumb></div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);
  setReaderScrollLock(true);

  const els = {
    summary: root.querySelector(".epr-summary"),
    loader: root.querySelector(".epr-loader"),
    loaderPercent: root.querySelector(".epr-loader-percent"),
    loaderFound: root.querySelector(".epr-loader-found"),
    loaderDetail: root.querySelector(".epr-loader-detail"),
    list: root.querySelector(".epr-list"),
    status: root.querySelector("[data-status-filter]"),
    statusToggle: root.querySelector(".epr-single-select-toggle"),
    statusLabel: root.querySelector(".epr-status-filter-label"),
    statusMenu: root.querySelector(".epr-single-select-menu"),
    section: root.querySelector("[data-section-filter]"),
    sectionToggle: root.querySelector(".epr-multi-select-toggle"),
    sectionLabel: root.querySelector(".epr-section-filter-label"),
    sectionMenu: root.querySelector(".epr-multi-select-menu"),
    toggle: root.querySelector('[data-action="toggle-original"]'),
    customScrollbar: root.querySelector("[data-custom-scrollbar]"),
    customScrollbarThumb: root.querySelector("[data-custom-scrollbar-thumb]")
  };
  let scrollbarUpdateFrame = 0;
  let scrollbarDrag = null;

  showInitialLoader();
  whenBodyReady().then(initializeReader);

  function initializeReader() {
    restoreFilters();
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        restoreFilters();
        if (restoreCachedPosts()) {
          startRecentLoad();
        } else {
          scanAndRender(true);
        }
      }
    });

    root.addEventListener("input", handleFilterChange);
    root.addEventListener("change", handleFilterChange);
    root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!event.target.closest("[data-section-filter]")) closeSectionMenu();
      if (!event.target.closest("[data-status-filter]")) closeStatusMenu();
      if (action === "rescan") startFullLoad({ reset: true });
      if (action === "toggle-original") toggleOriginal();
      if (action === "reset-filters") resetFilters();
      if (action === "toggle-status-menu") toggleStatusMenu();
      if (action === "set-status") setStatusFilter(event.target.closest("[data-status-value]")?.dataset.statusValue || "all");
      if (action === "toggle-section-menu") toggleSectionMenu();
      if (action === "clear-sections") setSelectedSections([]);
      if (action === "toggle-section") toggleSelectedSection(event.target.closest("[data-section-value]")?.dataset.sectionValue || "");
      if (action === "close-modal") closePostModal();
      if (action === "previous-post") showAdjacentPost(-1);
      if (action === "next-post") showAdjacentPost(1);
      if (action === "previous-image") showAdjacentImage(-1);
      if (action === "next-image") showAdjacentImage(1);

      const card = event.target.closest(".epr-card[data-post-id]");
      if (card && !event.target.closest("a, button")) {
        openPostModal(card.dataset.postId);
      }
    });
    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) {
        closeStatusMenu();
        closeSectionMenu();
      }
    });
    document.addEventListener("keydown", handleKeyboard);
    root.addEventListener("scroll", queueCustomScrollbarUpdate, { passive: true });
    window.addEventListener("resize", queueCustomScrollbarUpdate);
    els.customScrollbar.addEventListener("pointerdown", handleCustomScrollbarPointerDown);
    els.customScrollbar.addEventListener("pointermove", handleCustomScrollbarPointerMove);
    els.customScrollbar.addEventListener("pointerup", handleCustomScrollbarPointerEnd);
    els.customScrollbar.addEventListener("pointercancel", handleCustomScrollbarPointerEnd);
    els.customScrollbarThumb.addEventListener("pointermove", handleCustomScrollbarPointerMove);
    els.customScrollbarThumb.addEventListener("pointerup", handleCustomScrollbarPointerEnd);
    els.customScrollbarThumb.addEventListener("pointercancel", handleCustomScrollbarPointerEnd);
    window.addEventListener("popstate", syncModalFromUrl);
    window.addEventListener("hashchange", syncModalFromUrl);

    const observer = new MutationObserver(debounce(() => scanAndRender(false), 650));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    setTimeout(() => applyOriginalBackground(root), 700);
    setTimeout(() => applyOriginalBackground(root), 2500);
    const initializedFromCache = restoreCachedPosts();
    if (initializedFromCache) {
      setTimeout(() => startRecentLoad(), 0);
    } else {
      setTimeout(() => startFullLoad({ reset: true }), 0);
      setTimeout(() => scanAndRender(true), 2500);
      setTimeout(() => scanAndRender(true), 6000);
    }
  }

  function showInitialLoader() {
    root.classList.add("epr-loading", "epr-boot-loading");
    state.loadMessage = "Chargement complet du Padlet...";
    updateLoadProgress({ found: 0, total: 0, percent: 0, round: 0, maxRounds: 0, stableRounds: 0 });
  }

  function whenBodyReady() {
    if (document.body) return Promise.resolve();
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.body) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.documentElement, { childList: true });
    });
  }

  function scanAndRender(force) {
    if (state.loadedFromApi && !state.isCheckingRecent) return;
    const posts = extractPosts();
    const signature = posts.map((post) => `${post.title}|${post.text.length}|${post.dateKey}`).join("::");
    if (!force && signature === state.lastSignature) return;
    state.lastSignature = signature;
    if (state.isCheckingRecent && state.cachedLatestDate) {
      mergeRecentPosts(posts, state.cachedLatestDate);
    } else {
      mergePosts(posts);
    }
    state.posts = finalizePosts([...state.postMap.values()]).sort(comparePosts);
    updateSections();
    render();
    openPendingModalFromUrl();
  }

  async function startFullLoad({ reset = false } = {}) {
    if (state.isLoadingAll) return;
    if (reset) {
      state.postMap.clear();
      state.posts = [];
      state.lastSignature = "";
      state.cacheLoaded = false;
      state.cachedLatestDate = null;
      state.loadedFromApi = false;
    }

    state.isLoadingAll = true;
    root.classList.add("epr-loading");
    state.loadMessage = "Chargement complet du Padlet...";
    updateLoadProgress({ found: 0, total: detectExpectedPostCount(), percent: 0, round: 0, maxRounds: 0, stableRounds: 0 });
    render();

    try {
      await loadAllPadletPosts();
    } finally {
      state.isLoadingAll = false;
      root.classList.remove("epr-loading");
      state.loadMessage = "";
      updateLoadProgress({ found: state.posts.length, total: Math.max(state.loadProgress.total || 0, state.posts.length), percent: 100 });
      if (state.loadedFromApi) {
        render();
        openPendingModalFromUrl();
      } else {
        scanAndRender(true);
      }
      saveCachedPosts();
    }
  }

  async function startRecentLoad() {
    if (state.isLoadingAll || state.isCheckingRecent || !state.cachedLatestDate) return;

    state.isCheckingRecent = true;
    state.loadMessage = "Recherche des nouvelles publications...";
    render();

    try {
      await loadRecentPadletPosts(state.cachedLatestDate);
    } finally {
      state.isCheckingRecent = false;
      state.loadMessage = "";
      state.posts = finalizePosts([...state.postMap.values()]).sort(comparePosts);
      updateSections();
      saveCachedPosts();
      render();
    }
  }

  async function loadAllPadletPosts() {
    if (await loadAllPadletPostsFromApi()) return;

    const positions = rememberScrollPositions();
    const originalZoom = document.body.style.zoom;
    const maxRounds = 34;
    let stableRounds = 0;
    let lastCount = -1;
    let expectedTotal = detectExpectedPostCount();

    document.body.style.zoom = "0.35";
    await wait(500);
    scanAndRender(true);
    expectedTotal = Math.max(expectedTotal, detectExpectedPostCount());
    updateLoadProgress({ found: state.posts.length, total: expectedTotal, round: 0, maxRounds, stableRounds });

    try {
      for (let round = 0; round < maxRounds; round += 1) {
        state.loadMessage = `Chargement complet du Padlet... ${state.posts.length} trouvee${state.posts.length > 1 ? "s" : ""}`;
        updateLoadProgress({ found: state.posts.length, total: expectedTotal, round, maxRounds, stableRounds });
        render();

        const moved = advanceLazyScroll(round);
        await wait(420);
        scanAndRender(true);
        expectedTotal = Math.max(expectedTotal, detectExpectedPostCount());

        if (state.posts.length === lastCount) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
          lastCount = state.posts.length;
        }

        updateLoadProgress({ found: state.posts.length, total: expectedTotal, round: round + 1, maxRounds, stableRounds });

        if (!moved && stableRounds >= 3) break;
        if (stableRounds >= 6) break;
      }
    } finally {
      document.body.style.zoom = originalZoom;
      restoreScrollPositions(positions);
    }
  }

  async function loadRecentPadletPosts(cutoffDate) {
    const positions = rememberScrollPositions();
    const originalZoom = document.body.style.zoom;
    const maxRounds = 8;
    let stableRounds = 0;
    let lastCount = state.posts.length;

    try {
      document.body.style.zoom = "0.55";
      await wait(350);
      mergeRecentPosts(extractPosts(), cutoffDate);
      state.posts = finalizePosts([...state.postMap.values()]).sort(comparePosts);
      updateSections();
      render();

      for (let round = 0; round < maxRounds; round += 1) {
        state.loadMessage = `Recherche des nouvelles publications... ${state.posts.length} en cache`;
        render();

        const moved = advanceLazyScroll(round);
        await wait(320);
        mergeRecentPosts(extractPosts(), cutoffDate);
        state.posts = finalizePosts([...state.postMap.values()]).sort(comparePosts);
        updateSections();

        if (state.posts.length === lastCount) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
          lastCount = state.posts.length;
        }

        if (!moved && stableRounds >= 2) break;
        if (stableRounds >= 3) break;
      }
    } finally {
      document.body.style.zoom = originalZoom;
      restoreScrollPositions(positions);
    }
  }

  async function loadAllPadletPostsFromApi() {
    root.dataset.loadSource = "api-pending";
    root.dataset.apiError = "";
    if (location.href.includes(TEST_PAGE)) return false;

    const wallHashid = await waitForPadletWallHashid();
    root.dataset.wallHashid = wallHashid;
    if (!wallHashid) {
      root.dataset.loadSource = "dom";
      root.dataset.apiError = "wall_hashid not found";
      return false;
    }

    try {
      const wishes = [];
      let pageStart = "";
      let wallId = "";

      for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
        const url = `https://padlet.com/api/10/wishes?wall_hashid=${encodeURIComponent(wallHashid)}&page_start=${encodeURIComponent(pageStart)}&v=`;
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error(`Padlet wishes API ${response.status}`);
        const payload = await response.json();
        const pageWishes = Array.isArray(payload.data) ? payload.data : [];
        wishes.push(...pageWishes);
        wallId ||= pageWishes.find((wish) => wish?.attributes?.wall_id)?.attributes?.wall_id || "";

        state.loadMessage = `Chargement API Padlet... ${wishes.length} publication${wishes.length > 1 ? "s" : ""} trouvee${wishes.length > 1 ? "s" : ""}`;
        updateLoadProgress({ found: wishes.length, total: Math.max(state.loadProgress.total || 0, wishes.length), round: pageIndex + 1, maxRounds: 0, stableRounds: 0 });
        render();

        pageStart = payload.meta?.next || "";
        if (!pageStart) break;
      }

      if (!wishes.length) return false;

      const sectionMap = await fetchPadletSectionMap(wallId);
      const posts = wishes.map((wish, index) => apiWishToPost(wish, sectionMap, index)).filter(Boolean);
      if (!posts.length) return false;

      state.postMap.clear();
      posts.forEach((post) => state.postMap.set(post.id, post));
      state.posts = posts.sort(comparePosts);
      state.loadedFromApi = true;
      root.dataset.loadSource = "api";
      root.dataset.apiCount = String(state.posts.length);
      state.loadMessage = `Chargement API Padlet termine : ${state.posts.length} publications`;
      updateSections();
      render();
      return true;
    } catch (error) {
      console.warn("UglyPadlet API loading failed, falling back to DOM scan.", error);
      state.loadedFromApi = false;
      root.dataset.loadSource = "dom";
      root.dataset.apiError = String(error?.message || error);
      return false;
    }
  }

  async function fetchPadletSectionMap(wallId) {
    const sectionMap = new Map();
    if (!wallId) return sectionMap;

    try {
      const response = await fetch(`https://padlet.com/api/5/wall_sections?wall_id=${encodeURIComponent(wallId)}&`, { credentials: "include" });
      if (!response.ok) return sectionMap;
      const payload = await response.json();
      (Array.isArray(payload.data) ? payload.data : []).forEach((section) => {
        const id = String(section?.attributes?.id || section?.id || "");
        const title = cleanText(section?.attributes?.title || "");
        if (id && title) sectionMap.set(id, title);
      });
    } catch {
      // Section names are nice to have; the post still renders without them.
    }

    return sectionMap;
  }

  function apiWishToPost(wish, sectionMap, index) {
    const attributes = wish?.attributes || {};
    const title = cleanText(htmlToText(attributes.subject || attributes.headline || attributes.attachment_link?.title || "Communication"));
    const body = cleanText(htmlToText(attributes.body || attributes.wish_content?.body || ""));
    const attachmentTitle = cleanText(htmlToText(attributes.attachment_caption || attributes.attachment_link?.title || ""));
    const textParts = [title, body, attachmentTitle].filter(Boolean);
    const text = cleanText(textParts.join("\n\n"));
    if (!title || !text) return null;

    const dates = extractDates(text);
    const fallbackDate = readPadletPublishedDate(attributes);
    const primaryDate = choosePrimaryDate(dates) || fallbackDate;
    const sectionId = String(attributes.wall_section_id || "");
    const links = apiWishLinks(attributes, title);
    const images = apiWishImages(attributes);
    const apiId = String(attributes.hashid || wish.id || attributes.id || hash(text));

    return {
      id: `padlet-${apiId}`,
      index,
      title: limit(title, 110),
      text,
      section: sectionMap.get(sectionId) || "Non classee",
      urlSlug: normalizeWishSlug(attributes.hashid || ""),
      dates: dates.length ? dates : (fallbackDate ? [fallbackDate] : []),
      date: primaryDate,
      dateKey: primaryDate ? formatDateKey(primaryDate) : "",
      links,
      images
    };
  }

  function apiWishLinks(attributes, title) {
    const candidates = [
      {
        href: attributes.attachment,
        label: attributes.attachment_caption || attributes.attachment_link?.title || title
      },
      {
        href: attributes.attachment_link?.url,
        label: attributes.attachment_link?.title || attributes.attachment_caption || title
      },
      ...(Array.isArray(attributes.attachments) ? attributes.attachments.map((attachment) => ({
        href: attachment.url || attachment.download_url || attachment.attachment,
        label: attachment.title || attachment.name || title
      })) : [])
    ];

    return candidates
      .filter((link) => link.href)
      .map((link) => ({
        href: link.href,
        label: limit(cleanText(htmlToText(link.label || readableUrlLabel(link.href))), 90),
        isPdf: isPdfHref(link.href) || /\.pdf(?:$|[?#])/i.test(link.href)
      }))
      .filter((link, index, links) => links.findIndex((other) => other.href === link.href) === index)
      .slice(0, 6);
  }

  function apiWishImages(attributes) {
    const candidates = [
      attributes.attachment_link?.preview_image?.url,
      attributes.attachment_link?.provider_image?.url,
      ...(Array.isArray(attributes.attachments) ? attributes.attachments.flatMap((attachment) => [
        attachment.url,
        attachment.thumbnail_url,
        attachment.preview_url
      ]) : [])
    ];

    return candidates
      .filter((src) => src && /\.(?:png|jpe?g|gif|webp)(?:$|[?#])/i.test(src))
      .filter((src, index, arr) => arr.indexOf(src) === index)
      .slice(0, 12);
  }

  function findPadletWallHashid() {
    const resourceMatch = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .join("\n")
      .match(/[?&]wall_hashid=(board_[A-Za-z0-9]+)/);
    if (resourceMatch?.[1]) return resourceMatch[1];

    const html = document.documentElement.innerHTML;
    return html.match(/board_[A-Za-z0-9]{10,}/)?.[0] || "";
  }

  async function waitForPadletWallHashid() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const wallHashid = findPadletWallHashid();
      if (wallHashid) return wallHashid;
      await wait(250);
    }
    return "";
  }

  function htmlToText(value) {
    const template = document.createElement("template");
    template.innerHTML = String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "</$1>\n")
      .replace(/<(p|div|li|h[1-6])\b[^>]*>/gi, "\n<$1>");
    return cleanText(template.content.textContent || template.innerHTML || String(value || ""))
      .replace(/([.!?])(?=[A-ZÀ-ÖØ-Þ])/g, "$1 ");
  }

  function updateLoadProgress(partial) {
    state.loadProgress = {
      ...state.loadProgress,
      ...partial
    };

    const total = state.loadProgress.total || 0;
    const found = state.loadProgress.found || 0;
    const scanPercent = state.loadProgress.maxRounds ? Math.round((state.loadProgress.round / state.loadProgress.maxRounds) * 96) : 0;
    const totalPercent = total ? Math.min(99, Math.round((found / total) * 100)) : 0;
    state.loadProgress.percent = typeof partial.percent === "number" ? partial.percent : Math.max(scanPercent, totalPercent);

    updateLoader();
  }

  function updateLoader() {
    if (!els.loader) return;
    const progress = state.loadProgress;
    const foundLabel = `${progress.found} communication${progress.found > 1 ? "s" : ""} trouvee${progress.found > 1 ? "s" : ""}`;
    const totalLabel = progress.total ? ` sur ${progress.total} attendue${progress.total > 1 ? "s" : ""}` : "";
    const detail = progress.total
      ? "Le total detecte vient des donnees exposees par Padlet au chargement."
      : "Total Padlet non expose clairement, balayage complet en cours.";

    els.loader.style.setProperty("--epr-loader-progress", `${Math.max(0, Math.min(100, progress.percent || 0)) * 3.6}deg`);
    els.loaderPercent.textContent = progress.total || progress.percent >= 100 ? `${Math.round(progress.percent || 0)}%` : "...";
    els.loaderFound.textContent = `${foundLabel}${totalLabel}`;
    els.loaderDetail.textContent = progress.stableRounds
      ? `${detail} Stabilisation ${progress.stableRounds}/6.`
      : detail;
  }

  function detectExpectedPostCount() {
    const numbers = [
      detectExpectedPostCountFromJson(),
      detectExpectedPostCountFromText()
    ].filter((value) => Number.isFinite(value) && value > 0 && value < 1000);
    return numbers.length ? Math.max(...numbers) : 0;
  }

  function detectExpectedPostCountFromText() {
    const text = cleanText(document.body?.innerText || "");
    const candidates = [
      ...text.matchAll(/\+\s*(\d{1,3})\s*[\u2022•]\s*\d+\s*jours?/gi),
      ...text.matchAll(/(\d{1,3})\s+publications?/gi),
      ...text.matchAll(/(\d{1,3})\s+communications?/gi),
      ...text.matchAll(/sur\s+(\d{1,3})/gi)
    ].map((match) => Number(match[1]));
    return candidates.length ? Math.max(...candidates) : 0;
  }

  function detectExpectedPostCountFromJson() {
    const html = document.documentElement.innerHTML;
    const candidates = [];
    const patterns = [
      /"post_count"\s*:\s*(\d{1,3})/gi,
      /"posts_count"\s*:\s*(\d{1,3})/gi,
      /"wish_count"\s*:\s*(\d{1,3})/gi,
      /"wishes_count"\s*:\s*(\d{1,3})/gi,
      /"subject_count"\s*:\s*(\d{1,3})/gi,
      /"postsCount"\s*:\s*(\d{1,3})/g,
      /"wishCount"\s*:\s*(\d{1,3})/g
    ];

    patterns.forEach((pattern) => {
      for (const match of html.matchAll(pattern)) candidates.push(Number(match[1]));
    });

    return candidates.length ? Math.max(...candidates) : 0;
  }

  function mergePosts(posts) {
    posts.forEach((post) => {
      const key = getPostKey(post);
      const existing = state.postMap.get(key);
      if (!existing || post.text.length > existing.text.length || post.images.length > existing.images.length) {
        state.postMap.set(key, { ...post, id: key });
      }
    });
  }

  function mergeRecentPosts(posts, cutoffDate) {
    mergePosts(posts.filter((post) => isRecentEnough(post, cutoffDate)));
  }

  function isRecentEnough(post, cutoffDate) {
    if (!post.date || !cutoffDate) return false;
    return post.date >= startOfDay(cutoffDate);
  }

  function finalizePosts(posts) {
    return removeAggregatePosts(removeContainedPosts(posts.filter(uniqueByContent).filter((post) => !isAggregateLikePost(post))));
  }

  function getPostKey(post) {
    const compactTitle = compactForCompare(post.title).slice(0, 140);
    const compactText = compactForCompare(post.text).slice(0, 320);
    return hash(`${post.dateKey}|${compactTitle}|${compactText}`);
  }

  function restoreCachedPosts() {
    if (!CACHE_ENABLED) return false;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw);
      if (!Array.isArray(cached.posts) || !cached.posts.length) return false;

      state.postMap.clear();
      cached.posts.map(restoreCachedPost).filter(Boolean).forEach((post) => {
        state.postMap.set(getPostKey(post), post);
      });
      state.posts = finalizePosts([...state.postMap.values()]).sort(comparePosts);
      state.cacheLoaded = true;
      state.cachedLatestDate = getLatestPostDate(state.posts);
      updateSections();
      render();
      return true;
    } catch {
      return false;
    }
  }

  function saveCachedPosts() {
    if (!CACHE_ENABLED) return;
    try {
      const payload = {
        savedAt: new Date().toISOString(),
        posts: state.posts.map(cachePost)
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      state.cacheLoaded = true;
      state.cachedLatestDate = getLatestPostDate(state.posts);
    } catch {
      // If the browser refuses storage, UglyPadlet simply works without cache.
    }
  }

  function cachePost(post) {
    return {
      id: post.id,
      index: post.index,
      title: post.title,
      text: post.text,
      section: post.section,
      urlSlug: post.urlSlug || "",
      date: post.date ? post.date.toISOString() : "",
      dates: post.dates.map((date) => date.toISOString()),
      dateKey: post.dateKey,
      links: post.links,
      images: post.images.filter((src) => !src.startsWith("data:"))
    };
  }

  function restoreCachedPost(post) {
    if (!post || !post.text || !post.title) return null;
    const dates = Array.isArray(post.dates) ? post.dates.map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime())) : [];
    const date = post.date ? new Date(post.date) : null;
    return {
      id: post.id || hash(post.text),
      index: Number(post.index) || 0,
      title: post.title,
      text: post.text,
      section: post.section || "Non classee",
      urlSlug: post.urlSlug || "",
      dates,
      date: date && !Number.isNaN(date.getTime()) ? date : null,
      dateKey: post.dateKey || "",
      links: Array.isArray(post.links) ? post.links.map(normalizeCachedLink).filter(Boolean) : [],
      images: Array.isArray(post.images) ? post.images : []
    };
  }

  function getLatestPostDate(posts) {
    const dates = posts.map((post) => post.date).filter(Boolean);
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }

  function advanceLazyScroll(round) {
    const targets = getScrollableTargets();
    let moved = false;

    targets.forEach((target) => {
      const maxLeft = Math.max(0, target.scrollWidth - target.clientWidth);
      const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
      const nextLeft = maxLeft ? Math.min(maxLeft, Math.round(round * target.clientWidth * 0.8)) : 0;
      const verticalRound = maxLeft ? round % 7 : round;
      const nextTop = maxTop ? Math.min(maxTop, Math.round(verticalRound * target.clientHeight * 0.7)) : 0;

      if (Math.abs(target.scrollLeft - nextLeft) > 2 || Math.abs(target.scrollTop - nextTop) > 2) {
        target.scrollLeft = nextLeft;
        target.scrollTop = nextTop;
        moved = true;
      }
    });

    window.scrollTo(Math.round(round * window.innerWidth * 0.75), Math.round((round % 7) * window.innerHeight * 0.7));
    return moved;
  }

  function getScrollableTargets() {
    const candidates = [document.scrollingElement, document.documentElement, document.body];
    document.querySelectorAll("main, section, div, [role='main'], [role='list'], [data-testid], [class]").forEach((node) => {
      if (node instanceof HTMLElement && !root.contains(node)) candidates.push(node);
    });

    return [...new Set(candidates)]
      .filter((node) => node && node instanceof Element && !root.contains(node))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 80) return false;
        return node.scrollWidth > node.clientWidth + 40 || node.scrollHeight > node.clientHeight + 40;
      })
      .sort((a, b) => (b.scrollWidth * b.scrollHeight) - (a.scrollWidth * a.scrollHeight))
      .slice(0, 24);
  }

  function rememberScrollPositions() {
    return getScrollableTargets().map((target) => ({
      target,
      left: target.scrollLeft,
      top: target.scrollTop
    }));
  }

  function restoreScrollPositions(positions) {
    positions.forEach(({ target, left, top }) => {
      if (target?.isConnected || target === document.scrollingElement || target === document.body || target === document.documentElement) {
        target.scrollLeft = left;
        target.scrollTop = top;
      }
    });
    window.scrollTo(0, 0);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function handleFilterChange(event) {
    const key = event.target?.dataset?.filter;
    if (!key) return;
    state[key] = event.target.value;
    saveFilters();
    render();
  }

  function restoreFilters() {
    try {
      const raw = localStorage.getItem(FILTER_CACHE_KEY);
      const filters = raw ? JSON.parse(raw) : {};
      state.query = typeof filters.query === "string" ? filters.query : "";
      state.status = ["all", "upcoming", "past"].includes(filters.status) ? filters.status : "all";
      state.sections = normalizeSelectedSections(filters.sections || filters.section);
      state.pendingSections = [...state.sections];
      state.from = isInputDate(filters.from) ? filters.from : "";
      state.to = isInputDate(filters.to) ? filters.to : "";
    } catch {
      state.query = "";
      state.status = "all";
      state.sections = [];
      state.pendingSections = [];
      state.from = "";
      state.to = "";
    }

    syncFilterControls();
  }

  function saveFilters() {
    try {
      localStorage.setItem(FILTER_CACHE_KEY, JSON.stringify({
        query: state.query,
        status: state.status,
        section: state.sections.length === 1 ? state.sections[0] : "all",
        sections: state.sections,
        from: state.from,
        to: state.to
      }));
    } catch {
      // If storage is unavailable, filters simply last for the current page.
    }
  }

  function syncFilterControls() {
    root.querySelector('[data-filter="query"]').value = state.query;
    root.querySelector('[data-filter="from"]').value = state.from;
    root.querySelector('[data-filter="to"]').value = state.to;
    syncStatusFilterControls();
    syncSectionFilterControls();
  }

  function syncStatusFilterControls() {
    const label = getStatusFilterLabel();
    els.status.classList.toggle("epr-single-select-active", state.status !== "all");
    els.statusToggle.setAttribute("aria-label", label);
    els.statusLabel.textContent = label;
    els.statusMenu.querySelectorAll("[data-status-value]").forEach((option) => {
      const checked = option.dataset.statusValue === state.status;
      option.classList.toggle("epr-selected", checked);
      option.setAttribute("aria-checked", String(checked));
    });
  }

  function getStatusFilterLabel() {
    return STATUS_OPTIONS.find(([value]) => value === state.status)?.[1] || "Toutes";
  }

  function toggleStatusMenu() {
    closeSectionMenu();
    const isOpen = els.status.classList.toggle("epr-open");
    els.statusToggle.setAttribute("aria-expanded", String(isOpen));
    els.statusMenu.hidden = !isOpen;
  }

  function closeStatusMenu() {
    els.status.classList.remove("epr-open");
    els.statusToggle.setAttribute("aria-expanded", "false");
    els.statusMenu.hidden = true;
  }

  function setStatusFilter(status) {
    state.status = STATUS_OPTIONS.some(([value]) => value === status) ? status : "all";
    closeStatusMenu();
    saveFilters();
    syncStatusFilterControls();
    render();
  }

  function normalizeSelectedSections(value) {
    if (Array.isArray(value)) return [...new Set(value.map((section) => cleanText(section)).filter(Boolean).filter((section) => section !== "all"))];
    if (typeof value === "string" && value && value !== "all") return [value];
    return [];
  }

  function syncSectionFilterControls() {
    const selected = new Set(state.sections);
    els.section.classList.toggle("epr-multi-select-active", selected.size > 0);
    els.sectionToggle.setAttribute("aria-label", getSectionFilterLabel());
    els.sectionLabel.textContent = getSectionFilterLabel();
    els.sectionMenu.querySelectorAll("[data-section-value]").forEach((option) => {
      const checked = selected.has(option.dataset.sectionValue);
      option.classList.toggle("epr-selected", checked);
      option.setAttribute("aria-checked", String(checked));
    });
    const allOption = els.sectionMenu.querySelector("[data-action='clear-sections']");
    allOption.classList.toggle("epr-selected", selected.size === 0);
    allOption.setAttribute("aria-checked", String(selected.size === 0));
  }

  function getSectionFilterLabel() {
    if (!state.sections.length) return "Toutes les sections";
    if (state.sections.length === 1) return state.sections[0];
    return `${state.sections.length} sections`;
  }

  function toggleSectionMenu() {
    closeStatusMenu();
    const isOpen = els.section.classList.toggle("epr-open");
    els.sectionToggle.setAttribute("aria-expanded", String(isOpen));
    els.sectionMenu.hidden = !isOpen;
  }

  function closeSectionMenu() {
    els.section.classList.remove("epr-open");
    els.sectionToggle.setAttribute("aria-expanded", "false");
    els.sectionMenu.hidden = true;
  }

  function setSelectedSections(sections) {
    state.sections = normalizeSelectedSections(sections);
    state.pendingSections = [...state.sections];
    saveFilters();
    syncSectionFilterControls();
    render();
  }

  function toggleSelectedSection(section) {
    if (!section) return;
    const selected = new Set(state.sections);
    if (selected.has(section)) {
      selected.delete(section);
    } else {
      selected.add(section);
    }
    setSelectedSections([...selected]);
  }

  function resetFilters() {
    state.query = "";
    state.status = "all";
    state.sections = [];
    state.pendingSections = [];
    state.from = "";
    state.to = "";
    closeStatusMenu();
    closeSectionMenu();
    saveFilters();
    syncFilterControls();
    render();
    ensureResetListRendered();
  }

  function ensureResetListRendered(attempt = 0) {
    if (hasActiveFilters()) return;
    if (state.isLoadingAll || state.isCheckingRecent) {
      if (attempt < 20) setTimeout(() => ensureResetListRendered(attempt + 1), 250);
      return;
    }
    if (!state.posts.length) return;

    const renderedCards = els.list.querySelectorAll(".epr-card").length;
    if (renderedCards === state.posts.length && !els.list.querySelector(".epr-empty")) return;

    state.visiblePosts = state.posts;
    els.summary.textContent = `${state.posts.length} communication${state.posts.length > 1 ? "s" : ""} affichee${state.posts.length > 1 ? "s" : ""} sur ${state.posts.length}.`;
    els.list.innerHTML = state.posts.map(renderPost).join("");
    queueCustomScrollbarUpdate();
  }

  function hasActiveFilters() {
    return Boolean(state.query.trim() || state.status !== "all" || state.sections.length || state.from || state.to);
  }

  function isInputDate(value) {
    return typeof value === "string" && (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value));
  }

  function toggleOriginal() {
    state.showOriginal = !state.showOriginal;
    root.classList.toggle("epr-minimized", state.showOriginal);
    setReaderScrollLock(!state.showOriginal);
    els.toggle.textContent = state.showOriginal ? "Revenir au lecteur" : "Voir Padlet";
    els.toggle.setAttribute("aria-pressed", String(state.showOriginal));
  }

  function setReaderScrollLock(locked) {
    document.documentElement.classList.toggle("epr-reader-scroll-lock", locked);
    document.body?.classList.toggle("epr-reader-scroll-lock", locked);
  }

  function applyOriginalBackground(target) {
    const background = findOriginalBackground();
    if (background) {
      target.style.setProperty("--epr-site-background", background);
      target.classList.add("epr-has-site-background");
    }
  }

  function getPadletTitle() {
    if (location.href.includes(TEST_PAGE)) return "École Élan 2025-2026";
    const title = cleanText(document.title || "");
    if (/ecole|école|elan|élan/i.test(title)) return title;
    const heading = [...document.querySelectorAll("h1, [role='heading']")]
      .map((node) => cleanText(node.innerText || node.textContent || ""))
      .find((text) => /ecole|école|elan|élan/i.test(text));
    if (heading) return heading;
    if (location.href.includes("2026-2027")) return "École Élan 2026-2027";
    if (location.href.includes("2025-2026")) return "École Élan 2025-2026";
    return "École Élan";
  }

  function getExtensionVersion(fallback) {
    try {
      return chrome?.runtime?.getManifest?.().version || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function findOriginalBackground() {
    const selectors = [
      "body",
      "main",
      "[style*='background-image']",
      "[class*='background' i]",
      "[class*='wallpaper' i]",
      "[class*='surface' i]"
    ];

    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement) || root.contains(node)) continue;
        const image = getComputedStyle(node).backgroundImage;
        if (image && image !== "none" && image.includes("url(")) return image;
      }
    }

    return "";
  }

  function extractPosts() {
    const explicitSelectors = [
      "article",
      "[role='article']",
      "[data-testid*='post' i]",
      "[data-test-id*='post' i]",
      "[aria-label*='post' i]",
      "[class*='post' i]"
    ];
    const candidates = new Set();

    explicitSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (isPostCandidate(node)) candidates.add(node);
      });
    });

    if (candidates.size < 3) {
      document.querySelectorAll("main div, section div, [role='listitem'], [data-testid], [class]").forEach((node) => {
        if (isPostCandidate(node)) candidates.add(node);
      });
    }

    const posts = [...removeDuplicateContainers(removeNestedCandidates([...candidates]))]
      .map(readPost)
      .filter(Boolean)
      .filter(uniqueByContent);
    return removeAggregatePosts(removeContainedPosts(posts));
  }

  function isPostCandidate(node) {
    if (!(node instanceof HTMLElement) || root.contains(node)) return false;
    if (node.closest("[role='dialog'], [aria-modal='true']")) return false;
    if (!isVisible(node)) return false;

    const rect = node.getBoundingClientRect();
    const text = cleanText(node.innerText || node.textContent || "");
    if (isPadletUiChrome(text)) return false;
    if (looksLikeBoardContainer(text) || hasMultiplePostDescendants(node)) return false;
    if (text.length < 24 || text.length > 7000) return false;
    if (rect.width < 160 || rect.height < 45 || rect.height > window.innerHeight * 1.8) return false;

    const descriptor = `${node.tagName} ${node.className || ""} ${node.getAttribute("data-testid") || ""} ${node.getAttribute("aria-label") || ""}`;
    const score = [
      /article|post|card|subject|wish|surface|cell/i.test(descriptor),
      hasDate(text),
      node.querySelector("img, video, a[href]"),
      text.split("\n").length >= 2
    ].filter(Boolean).length;
    return score >= 2;
  }

  function removeNestedCandidates(nodes) {
    return nodes.filter((node) => {
      const nodeText = cleanText(node.innerText || "");
      return !nodes.some((other) => {
        if (node === other || !other.contains(node)) return false;
        const otherText = cleanText(other.innerText || "");
        return otherText.length < nodeText.length * 1.35;
      });
    });
  }

  function removeDuplicateContainers(nodes) {
    return nodes.filter((node) => {
      const nodeText = compactForCompare(node.innerText || "");
      const childCandidates = nodes.filter((other) => other !== node && node.contains(other));
      if (childCandidates.length < 2) return true;

      const meaningfulChildren = childCandidates
        .map((child) => compactForCompare(child.innerText || ""))
        .filter((text) => text.length >= 24 && nodeText.includes(text));
      if (meaningfulChildren.length < 2) return true;

      const longestChild = Math.max(...meaningfulChildren.map((text) => text.length));
      return !(nodeText.length > longestChild * 1.35);
    });
  }

  function readPost(node, index) {
    const fullText = cleanText(node.innerText || node.textContent || "");
    if (!fullText) return null;
    if (looksLikeBoardContainer(fullText)) return null;

    const lines = fullText.split("\n").map((line) => line.trim()).filter(Boolean);
    const titleNode = node.querySelector("h1, h2, h3, strong, b, [data-testid*='title' i]");
    const title = cleanText(titleNode?.innerText || lines.find((line) => line.length >= 4 && !isDateOnlyLine(line)) || "Communication");
    const dates = extractDates(fullText);
    const primaryDate = choosePrimaryDate(dates);
    const section = findSection(node, fullText);
    const links = [...node.querySelectorAll("a[href]")]
      .map((link) => normalizeLink(link))
      .filter(Boolean)
      .filter((link, idx, arr) => arr.findIndex((other) => other.href === link.href) === idx)
      .slice(0, 4);
    const images = [...node.querySelectorAll("img")]
      .map((img) => img.currentSrc || img.src)
      .filter((src) => src && !/avatar|profile|emoji|icon/i.test(src))
      .filter((src, idx, arr) => arr.indexOf(src) === idx)
      .slice(0, 12);

    return {
      id: hash(fullText),
      index,
      title: limit(title, 110),
      text: fullText,
      section,
      urlSlug: findPadletWishSlug(node),
      dates,
      date: primaryDate,
      dateKey: primaryDate ? formatDateKey(primaryDate) : "",
      links,
      images
    };
  }

  function findSection(node, text) {
    const detected = SECTION_KEYWORDS.find((keyword) => new RegExp(`(^|\\W)${escapeRegExp(keyword)}(\\W|$)`, "i").test(text));
    if (detected) return normalizeSection(detected);

    let current = node.parentElement;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      const heading = [...current.children].find((child) => {
        return !child.contains(node) && child.matches?.("h1, h2, h3, [role='heading'], [aria-label]");
      });
      const label = cleanText(heading?.innerText || heading?.getAttribute("aria-label") || current.getAttribute("aria-label") || "");
      if (label && label.length <= 45 && !/padlet|partager|connexion/i.test(label)) return label;
    }

    return "Non classee";
  }

  function findPadletWishSlug(node) {
    const values = [];
    [node, ...node.querySelectorAll("a[href], [href], [data-href], [data-url], [data-share-url]")].forEach((element) => {
      ["href", "data-href", "data-url", "data-share-url"].forEach((attribute) => {
        const value = element.getAttribute?.(attribute);
        if (value) values.push(value);
      });
    });

    for (const value of values) {
      const slug = extractWishSlug(value);
      if (slug) return slug;
    }
    return "";
  }

  function readModalRequestFromUrl() {
    const url = new URL(location.href);
    const slug = extractWishSlug(url.pathname);
    if (slug) return { type: "slug", value: slug };

    const postId = url.searchParams.get("uglyPost") || new URLSearchParams(url.hash.replace(/^#/, "")).get("uglyPost");
    return postId ? { type: "id", value: postId } : null;
  }

  function extractWishSlug(value) {
    const match = String(value || "").match(/\/wish\/([^/?#]+)/i);
    return match ? normalizeWishSlug(decodeURIComponent(match[1])) : "";
  }

  function normalizeWishSlug(value) {
    return String(value || "").trim().replace(/^post_/i, "");
  }

  function extractDates(text) {
    const normalized = removeAccents(text.toLowerCase());
    const dates = [];
    const numeric = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/g;
    const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
    const written = /\b(\d{1,2})(?:er)?\s+(janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+(\d{2,4}))?\b/g;

    for (const match of normalized.matchAll(numeric)) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      const year = normalizeYear(match[3], month);
      pushValidDate(dates, year, month, day);
    }

    for (const match of normalized.matchAll(iso)) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      pushValidDate(dates, year, month, day);
    }

    for (const match of normalized.matchAll(written)) {
      const day = Number(match[1]);
      const month = MONTHS.get(match[2]);
      const year = normalizeYear(match[3], month);
      pushValidDate(dates, year, month, day);
    }

    return dates.filter((date, index, arr) => arr.findIndex((other) => sameDay(other, date)) === index);
  }

  function readPadletPublishedDate(attributes) {
    const candidates = [
      attributes.published_at,
      attributes.scheduled_at,
      attributes.created_at,
      attributes.updated_at,
      attributes.content_updated_at
    ];

    for (const value of candidates) {
      const parsed = parsePadletDate(value);
      if (parsed) return parsed;
    }

    return null;
  }

  function parsePadletDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return startOfDay(date);
  }

  function normalizeYear(value, month) {
    if (value) {
      const year = Number(value);
      return year < 100 ? 2000 + year : year;
    }
    return month >= 7 ? 2025 : 2026;
  }

  function pushValidDate(dates, year, month, day) {
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      dates.push(startOfDay(date));
    }
  }

  function choosePrimaryDate(dates) {
    if (!dates.length) return null;
    const upcoming = dates.filter((date) => date >= TODAY).sort((a, b) => a - b);
    if (upcoming.length) return upcoming[0];
    return dates.sort((a, b) => b - a)[0];
  }

  function comparePosts(a, b) {
    if (a.date && b.date) return b.date - a.date;
    if (a.date) return -1;
    if (b.date) return 1;
    return a.index - b.index;
  }

  function updateSections() {
    const current = new Set(state.pendingSections.length ? state.pendingSections : state.sections);
    const sections = [...new Set(state.posts.map((post) => post.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    state.sections = sections.filter((section) => current.has(section));
    state.pendingSections = [...state.sections];
    els.sectionMenu.innerHTML = `
      <button type="button" class="epr-multi-select-option" data-action="clear-sections" role="checkbox">
        <span class="epr-checkbox-mark" aria-hidden="true"></span>
        <span>Toutes les sections</span>
      </button>
    ` + sections.map((section) => {
      return `
        <button type="button" class="epr-multi-select-option" data-action="toggle-section" data-section-value="${escapeHtml(section)}" role="checkbox">
          <span class="epr-checkbox-mark" aria-hidden="true"></span>
          <span>${escapeHtml(section)}</span>
        </button>
      `;
    }).join("");
    syncFilterControls();
  }

  function render() {
    try {
      const filtered = state.posts.filter(matchesFilters);
      state.visiblePosts = filtered;
      const source = (state.isLoadingAll || state.isCheckingRecent) && state.loadMessage ? ` ${state.loadMessage}.` : state.cacheLoaded ? " Depuis le cache." : "";
      els.summary.textContent = `${filtered.length} communication${filtered.length > 1 ? "s" : ""} affichee${filtered.length > 1 ? "s" : ""} sur ${state.posts.length}.${source}`;

      if (state.isLoadingAll) {
        els.list.innerHTML = "";
        return;
      }

      if (!state.posts.length) {
        if (state.isLoadingAll || state.isCheckingRecent) {
          els.list.innerHTML = "";
          return;
        }

        els.list.innerHTML = `
          <section class="epr-empty">
            <h2>Chargement des publications...</h2>
            <p>Si la page Padlet demande une connexion ou met du temps a charger, attends quelques secondes puis utilise Actualiser.</p>
          </section>
        `;
        return;
      }

      if (!filtered.length) {
        els.list.innerHTML = `
          <section class="epr-empty">
            <h2>Aucune communication pour ces filtres</h2>
            <p>Elargis la periode ou choisis une autre section.</p>
          </section>
        `;
        return;
      }

      els.list.innerHTML = filtered.map(renderPost).join("");
      if (state.modalIndex >= 0) renderPostModal();
      openPendingModalFromUrl();
    } finally {
      queueCustomScrollbarUpdate();
    }
  }

  function queueCustomScrollbarUpdate() {
    if (scrollbarUpdateFrame) return;
    scrollbarUpdateFrame = requestAnimationFrame(() => {
      scrollbarUpdateFrame = 0;
      updateCustomScrollbar();
    });
  }

  function updateCustomScrollbar() {
    if (!els.customScrollbar || !els.customScrollbarThumb || state.showOriginal) {
      els.customScrollbar.hidden = true;
      return;
    }

    const maxScroll = root.scrollHeight - root.clientHeight;
    if (maxScroll <= 1) {
      els.customScrollbar.hidden = true;
      return;
    }

    els.customScrollbar.hidden = false;
    const trackHeight = els.customScrollbar.clientHeight;
    if (!trackHeight) return;
    const thumbHeight = Math.min(trackHeight, Math.max(48, Math.round(trackHeight * (root.clientHeight / root.scrollHeight))));
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxThumbTop ? Math.round((root.scrollTop / maxScroll) * maxThumbTop) : 0;
    els.customScrollbarThumb.style.height = `${thumbHeight}px`;
    els.customScrollbarThumb.style.transform = `translateY(${thumbTop}px)`;
  }

  function handleCustomScrollbarPointerDown(event) {
    if (event.button !== 0 || state.showOriginal) return;
    event.preventDefault();
    const maxScroll = root.scrollHeight - root.clientHeight;
    if (maxScroll <= 1) return;

    if (event.target !== els.customScrollbarThumb) {
      scrollCustomScrollbarTo(event.clientY);
    }

    const trackRect = els.customScrollbar.getBoundingClientRect();
    const thumbRect = els.customScrollbarThumb.getBoundingClientRect();
    scrollbarDrag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: thumbRect.top - trackRect.top
    };
    els.customScrollbar.setPointerCapture(event.pointerId);
    els.customScrollbarThumb.classList.add("is-dragging");
  }

  function handleCustomScrollbarPointerMove(event) {
    if (!scrollbarDrag || event.pointerId !== scrollbarDrag.pointerId) return;
    event.preventDefault();
    const trackHeight = els.customScrollbar.clientHeight;
    const thumbHeight = els.customScrollbarThumb.offsetHeight;
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const maxScroll = root.scrollHeight - root.clientHeight;
    const nextTop = clamp(scrollbarDrag.startTop + event.clientY - scrollbarDrag.startY, 0, maxThumbTop);
    root.scrollTop = maxThumbTop ? (nextTop / maxThumbTop) * maxScroll : 0;
    updateCustomScrollbar();
  }

  function handleCustomScrollbarPointerEnd(event) {
    if (!scrollbarDrag || event.pointerId !== scrollbarDrag.pointerId) return;
    try {
      els.customScrollbar.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }
    scrollbarDrag = null;
    els.customScrollbarThumb.classList.remove("is-dragging");
  }

  function scrollCustomScrollbarTo(clientY) {
    const trackRect = els.customScrollbar.getBoundingClientRect();
    const thumbHeight = els.customScrollbarThumb.offsetHeight || 48;
    const maxThumbTop = Math.max(0, trackRect.height - thumbHeight);
    const maxScroll = root.scrollHeight - root.clientHeight;
    const nextTop = clamp(clientY - trackRect.top - thumbHeight / 2, 0, maxThumbTop);
    root.scrollTop = maxThumbTop ? (nextTop / maxThumbTop) * maxScroll : 0;
    updateCustomScrollbar();
  }

  function matchesFilters(post) {
    const query = removeAccents(state.query.trim().toLowerCase());
    const linkText = post.links.map((link) => `${link.label} ${link.href}`).join(" ");
    if (query && !removeAccents(`${post.title} ${post.text} ${post.section} ${linkText}`.toLowerCase()).includes(query)) return false;
    if (state.sections.length && !state.sections.includes(post.section)) return false;
    if (state.status === "past" && (!post.date || post.date >= TODAY)) return false;
    if (state.status === "upcoming" && (!post.date || post.date < TODAY)) return false;
    if (state.from && (!post.date || post.date < parseInputDate(state.from))) return false;
    if (state.to && (!post.date || post.date > parseInputDate(state.to))) return false;
    return true;
  }

  function renderPost(post) {
    const dateLabel = post.date ? post.date.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date non detectee";
    const body = renderFormattedText(getPostBodyText(post, { omitLinkLabels: true }));
    const displayLinks = getDisplayLinks(post);
    const hasPdf = displayLinks.some(isPdfLink);
    const youtubeLink = displayLinks.find(isYouTubeLink);
    const links = renderLinks(displayLinks);
    const images = hasPdf || youtubeLink ? "" : post.images.map((src) => `<img src="${escapeHtml(src)}" alt="" loading="lazy">`).join("");

    return `
      <article class="epr-card" data-post-id="${escapeHtml(post.id)}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHtml(post.title)}">
        <div class="epr-card-meta">
          <span class="epr-date-badge">${escapeHtml(dateLabel)}</span>
          ${renderSectionBadge(post.section)}
        </div>
        <h2>${escapeHtml(post.title)}</h2>
        ${youtubeLink ? renderYouTubeViewer(youtubeLink, { compact: true }) : ""}
        ${images ? `<div class="epr-images">${images}</div>` : ""}
        <p>${body}</p>
        ${links ? `<div class="epr-links">${links}</div>` : ""}
      </article>
    `;
  }

  function openPostModal(postId, { updateUrl = true } = {}) {
    const index = state.visiblePosts.findIndex((post) => post.id === postId);
    if (index < 0) return;
    state.modalIndex = index;
    state.modalImageIndex = 0;
    if (updateUrl) updateUrlForPost(state.visiblePosts[index]);
    renderPostModal();
  }

  function closePostModal({ updateUrl = true } = {}) {
    state.modalIndex = -1;
    state.modalImageIndex = 0;
    state.pendingModalRequest = null;
    root.querySelector(".epr-modal")?.remove();
    if (updateUrl) updateUrlForBoard();
  }

  function showAdjacentPost(direction, { updateUrl = true } = {}) {
    if (state.modalIndex < 0 || !state.visiblePosts.length) return;
    state.modalIndex = (state.modalIndex + direction + state.visiblePosts.length) % state.visiblePosts.length;
    state.modalImageIndex = 0;
    if (updateUrl) updateUrlForPost(state.visiblePosts[state.modalIndex]);
    renderPostModal();
  }

  function showAdjacentImage(direction) {
    const post = state.visiblePosts[state.modalIndex];
    if (!post || post.images.length < 2) return;
    state.modalImageIndex = (state.modalImageIndex + direction + post.images.length) % post.images.length;
    renderPostModal();
  }

  function syncModalFromUrl() {
    state.pendingModalRequest = readModalRequestFromUrl();
    if (!state.pendingModalRequest) {
      closePostModal({ updateUrl: false });
      return;
    }
    openPendingModalFromUrl();
  }

  function openPendingModalFromUrl() {
    const request = state.pendingModalRequest;
    if (!request || !state.visiblePosts.length) return false;
    const requestedSlug = request.type === "slug" ? normalizeWishSlug(request.value) : "";

    const index = state.visiblePosts.findIndex((post) => {
      if (request.type === "slug") return normalizeWishSlug(post.urlSlug) === requestedSlug;
      return post.id === request.value;
    });
    if (index < 0) return false;

    if (state.modalIndex !== index) {
      state.modalIndex = index;
      state.modalImageIndex = 0;
      renderPostModal();
    }
    return true;
  }

  function updateUrlForPost(post) {
    if (!post) return;
    const url = new URL(location.href);
    const useWishUrl = USE_PADLET_WISH_URLS && post.urlSlug;
    url.pathname = useWishUrl ? `${BOARD_PATH.replace(/\/$/, "")}/wish/${encodeURIComponent(post.urlSlug)}` : BOARD_PATH;
    if (useWishUrl) {
      url.searchParams.delete("uglyPost");
      url.hash = "";
    } else {
      url.searchParams.set("uglyPost", post.id);
      url.hash = "";
    }
    pushUrlIfChanged(url);
    state.pendingModalRequest = useWishUrl ? { type: "slug", value: post.urlSlug } : { type: "id", value: post.id };
  }

  function updateUrlForBoard() {
    const url = new URL(location.href);
    url.pathname = BOARD_PATH;
    url.searchParams.delete("uglyPost");
    url.hash = "";
    pushUrlIfChanged(url);
  }

  function pushUrlIfChanged(url) {
    const next = url.href;
    if (next !== location.href) history.pushState({ uglyPadlet: true }, "", next);
  }

  function renderPostModal() {
    const post = state.visiblePosts[state.modalIndex];
    if (!post) {
      closePostModal();
      return;
    }

    const pdfLink = getDisplayLinks(post).find(isPdfLink);
    root.querySelector(".epr-modal")?.remove();
    const modal = document.createElement("div");
    modal.className = pdfLink ? "epr-modal epr-modal-pdf" : "epr-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", post.title);
    const panel = pdfLink ? `
      <article class="epr-modal-panel epr-modal-panel-pdf">
        <header class="epr-modal-header">
          <div>
            <div class="epr-card-meta">
              <span class="epr-date-badge">${escapeHtml(post.date ? post.date.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date non detectee")}</span>
              ${renderSectionBadge(post.section)}
              <span class="epr-count-badge">${state.modalIndex + 1} / ${state.visiblePosts.length}</span>
            </div>
            <h2>${escapeHtml(post.title)}</h2>
          </div>
          <button type="button" class="epr-modal-close" data-action="close-modal" aria-label="Fermer">${renderIcon("x-lg")}</button>
        </header>
        ${renderPdfDescription(post)}
        ${renderPdfFrame(pdfLink)}
      </article>
    ` : `
      <article class="epr-modal-panel">
        <header class="epr-modal-header">
          <div>
            <div class="epr-card-meta">
              <span class="epr-date-badge">${escapeHtml(post.date ? post.date.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date non detectee")}</span>
              ${renderSectionBadge(post.section)}
              <span class="epr-count-badge">${state.modalIndex + 1} / ${state.visiblePosts.length}</span>
            </div>
            <h2>${escapeHtml(post.title)}</h2>
          </div>
          <button type="button" class="epr-modal-close" data-action="close-modal" aria-label="Fermer">${renderIcon("x-lg")}</button>
        </header>
        <div class="epr-modal-body">
          ${renderPostBody(post)}
        </div>
      </article>
    `;
    modal.innerHTML = `
      <div class="epr-modal-backdrop" data-action="close-modal"></div>
      <button type="button" class="epr-modal-nav epr-modal-prev" data-action="previous-post" aria-label="Publication precedente">${renderIcon("chevron-left")}</button>
      ${panel}
      <button type="button" class="epr-modal-nav epr-modal-next" data-action="next-post" aria-label="Publication suivante">${renderIcon("chevron-right")}</button>
    `;
    root.appendChild(modal);
    if (pdfLink) resolveModalPdfViewer(modal, pdfLink);
    modal.querySelector(".epr-modal-close")?.focus();
  }

  function renderPostBody(post) {
    const body = renderFormattedText(getPostBodyText(post, { omitLinkLabels: true }));
    const displayLinks = getDisplayLinks(post);
    const links = renderLinks(displayLinks);
    const pdfLink = displayLinks.find(isPdfLink);
    const youtubeLink = displayLinks.find(isYouTubeLink);
    return `
      ${pdfLink ? renderPdfViewer(pdfLink) : ""}
      ${!pdfLink && youtubeLink ? renderYouTubeViewer(youtubeLink) : ""}
      ${!pdfLink && !youtubeLink ? renderImageGallery(post) : ""}
      ${body ? `<p class="epr-post-text">${body}</p>` : ""}
      ${links ? `<div class="epr-links">${links}</div>` : ""}
    `;
  }

  function renderPdfDescription(post) {
    const body = renderFormattedText(getPostBodyText(post, { omitLinkLabels: true }));
    return body ? `<div class="epr-pdf-description"><p>${body}</p></div>` : "";
  }

  function renderIcon(name) {
    const paths = {
      "arrow-counterclockwise": [
        "M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z",
        "M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"
      ],
      "chevron-left": [
        "M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
      ],
      "chevron-right": [
        "M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
      ],
      "chevron-down": [
        "M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"
      ],
      "x-lg": [
        "M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"
      ]
    };
    const iconPaths = paths[name] || paths["x-lg"];
    return `
      <span class="epr-icon epr-icon-${escapeHtml(name)}" aria-hidden="true">
        <svg class="bi bi-${escapeHtml(name)}" viewBox="0 0 16 16" focusable="false">
          ${iconPaths.map((path) => `<path fill="currentColor" d="${path}"></path>`).join("")}
        </svg>
      </span>
    `;
  }

  function getPostBodyText(post, { omitLinkLabels = false } = {}) {
    let text = stripDuplicateTitle(post.text, post.title);
    if (!omitLinkLabels) return cleanText(text);

    const labels = getDisplayLinks(post)
      .flatMap((link) => [link.label, `PDF - ${link.label}`])
      .map((label) => cleanText(label || ""))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    const lines = cleanText(text).split("\n").map((line) => cleanText(line)).filter(Boolean);
    return repairPadletTextSpacing(cleanText(lines.filter((line) => !labels.includes(line)).join("\n")));
  }

  function renderFormattedText(text) {
    return renderAutoLinkedText(normalizeSentenceSpacing(text).replace(/\n{2,}/g, "\n")).replace(/\n/g, "<br>");
  }

  function renderAutoLinkedText(text) {
    const source = String(text || "");
    const urlPattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
    let result = "";
    let cursor = 0;
    let match;

    while ((match = urlPattern.exec(source))) {
      const rawMatch = match[0];
      const start = match.index;
      const { url, suffix } = splitTrailingUrlPunctuation(rawMatch);
      const href = url.startsWith("www.") ? `https://${url}` : url;

      result += escapeHtml(source.slice(cursor, start));
      result += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(suffix)}`;
      cursor = start + rawMatch.length;
    }

    return result + escapeHtml(source.slice(cursor));
  }

  function splitTrailingUrlPunctuation(value) {
    let url = String(value || "");
    let suffix = "";
    while (/[.,!?;:]$/.test(url) || (url.endsWith(")") && !hasBalancedParentheses(url))) {
      suffix = url.slice(-1) + suffix;
      url = url.slice(0, -1);
    }
    return { url, suffix };
  }

  function hasBalancedParentheses(value) {
    const opens = (value.match(/\(/g) || []).length;
    const closes = (value.match(/\)/g) || []).length;
    return closes <= opens;
  }

  function normalizeSentenceSpacing(text) {
    const source = cleanText(String(text || ""));
    const urlPattern = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
    let result = "";
    let cursor = 0;
    let match;

    while ((match = urlPattern.exec(source))) {
      result += source.slice(cursor, match.index).replace(/([.!?])(?=\S)/g, (mark) => `${mark} `);
      result += match[0];
      cursor = match.index + match[0].length;
    }

    result += source.slice(cursor).replace(/([.!?])(?=\S)/g, (mark) => `${mark} `);
    return repairPadletTextSpacing(result);
  }

  function repairPadletTextSpacing(text) {
    return String(text || "").replace(/MEQ\.Un/g, "MEQ. Un");
  }

  function renderSectionBadge(section) {
    const colors = getSectionBadgeColors(section);
    return `<span class="epr-section-badge" style="--epr-section-bg: ${colors.background}; --epr-section-fg: ${colors.foreground}; --epr-section-border: ${colors.border};">${escapeHtml(section)}</span>`;
  }

  function getSectionBadgeColors(section) {
    const seedText = removeAccents(cleanText(String(section || "Non classee")).toLowerCase()) || "non-classee";
    const seed = unsignedHash(seedText);
    const hue = seed % 360;
    const saturation = 52 + ((seed >>> 8) % 22);
    const preferredLightness = 38 + ((seed >>> 16) % 38);
    const textCandidates = [
      { color: "#17242b", rgb: [23, 36, 43] },
      { color: "#ffffff", rgb: [255, 255, 255] }
    ];
    const lightnessCandidates = [
      preferredLightness,
      Math.min(84, preferredLightness + 18),
      Math.max(30, preferredLightness - 18),
      82,
      32
    ];

    let best = null;
    for (const lightness of lightnessCandidates) {
      const rgb = hslToRgb(hue, saturation, lightness);
      for (const text of textCandidates) {
        const contrast = contrastRatio(rgb, text.rgb);
        const candidate = { rgb, foreground: text.color, lightness, contrast };
        if (!best || candidate.contrast > best.contrast) best = candidate;
        if (contrast >= 4.5) {
          return {
            background: rgbToHex(rgb),
            foreground: text.color,
            border: rgbToHex(hslToRgb(hue, saturation, Math.max(22, lightness - 14)))
          };
        }
      }
    }

    return {
      background: rgbToHex(best.rgb),
      foreground: best.foreground,
      border: rgbToHex(hslToRgb(hue, saturation, Math.max(22, best.lightness - 14)))
    };
  }

  function unsignedHash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function hslToRgb(hue, saturation, lightness) {
    const s = saturation / 100;
    const l = lightness / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = hue < 60 ? [c, x, 0]
      : hue < 120 ? [x, c, 0]
      : hue < 180 ? [0, c, x]
      : hue < 240 ? [0, x, c]
      : hue < 300 ? [x, 0, c]
      : [c, 0, x];
    return [r, g, b].map((channel) => Math.round((channel + m) * 255));
  }

  function rgbToHex(rgb) {
    return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  function contrastRatio(first, second) {
    const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
    const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function relativeLuminance(rgb) {
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function renderImageGallery(post) {
    if (!post.images.length) return "";
    if (post.images.length === 1) {
      return `<div class="epr-images"><img src="${escapeHtml(post.images[0])}" alt="" loading="lazy"></div>`;
    }

    const activeIndex = Math.min(state.modalImageIndex, post.images.length - 1);
    const dots = post.images.map((_, index) => {
      return `<span class="${index === activeIndex ? "epr-gallery-dot epr-gallery-dot-active" : "epr-gallery-dot"}"></span>`;
    }).join("");

    return `
      <section class="epr-gallery" aria-label="Photos">
        <div class="epr-gallery-frame">
          <button type="button" class="epr-gallery-nav epr-gallery-prev" data-action="previous-image" aria-label="Photo precedente">${renderIcon("chevron-left")}</button>
          <img src="${escapeHtml(post.images[activeIndex])}" alt="" loading="lazy">
          <button type="button" class="epr-gallery-nav epr-gallery-next" data-action="next-image" aria-label="Photo suivante">${renderIcon("chevron-right")}</button>
        </div>
        <div class="epr-gallery-count">${activeIndex + 1} / ${post.images.length}</div>
        <div class="epr-gallery-dots" aria-hidden="true">${dots}</div>
      </section>
    `;
  }

  function normalizeLink(link) {
    const href = link.href;
    if (!href || href.startsWith("javascript:")) return null;
    const text = cleanText(link.innerText || link.textContent || link.getAttribute("aria-label") || "");
    return {
      href,
      label: limit(text || readableUrlLabel(href), 90),
      isPdf: isPdfHref(href) || /(^|\W)pdf(\W|$)/i.test(text)
    };
  }

  function getDisplayLinks(post) {
    const isPdfPost = isLikelyPdfPost(post);
    return post.links.map((link, index) => {
      const shouldUpgradePdf = isPdfPost && index === 0 && !link.isPdf;
      const label = shouldUpgradePdf || isOpaqueLinkLabel(link.label) ? post.title : link.label;
      return {
        ...link,
        label: limit(label, 90),
        isPdf: Boolean(link.isPdf) || shouldUpgradePdf
      };
    });
  }

  function normalizeCachedLink(link) {
    if (typeof link === "string") {
      return {
        href: link,
        label: readableUrlLabel(link),
        isPdf: isPdfHref(link)
      };
    }
    if (!link || typeof link.href !== "string") return null;
    return {
      href: link.href,
      label: limit(link.label || readableUrlLabel(link.href), 90),
      isPdf: Boolean(link.isPdf) || isPdfHref(link.href)
    };
  }

  function renderLinks(links) {
    return links.map((link) => {
      const label = link.isPdf ? `PDF - ${link.label}` : link.label;
      return `<a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
    }).join("");
  }

  function renderYouTubeViewer(link, options = {}) {
    const embedUrl = getYouTubeEmbedUrl(link.href);
    if (!embedUrl) return "";
    const compactClass = options.compact ? " epr-youtube-viewer-compact" : "";
    return `
      <section class="epr-youtube-viewer${compactClass}" aria-label="Video YouTube">
        <iframe
          src="${escapeHtml(embedUrl)}"
          title="${escapeHtml(link.label || "Video YouTube")}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </section>
    `;
  }

  function renderPdfViewer(link) {
    return `
      <section class="epr-pdf-viewer" aria-label="Apercu PDF">
        ${renderPdfFrame(link)}
        <p><a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">Ouvrir le PDF dans un nouvel onglet</a></p>
      </section>
    `;
  }

  function renderPdfFrame(link) {
    const initialSrc = isPdfHref(link.href) ? withPdfViewerOptions(link.href) : "about:blank";
    return `<iframe src="${escapeHtml(initialSrc)}" data-pdf-source="${escapeHtml(link.href)}" title="${escapeHtml(link.label)}"></iframe>`;
  }

  function isYouTubeLink(link) {
    return Boolean(getYouTubeVideoId(link?.href));
  }

  function getYouTubeEmbedUrl(href) {
    const videoId = getYouTubeVideoId(href);
    if (!videoId) return "";
    const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
    const start = getYouTubeStartSeconds(href);
    if (start > 0) url.searchParams.set("start", String(start));
    url.searchParams.set("rel", "0");
    url.searchParams.set("modestbranding", "1");
    return url.href;
  }

  function getYouTubeVideoId(href) {
    try {
      const url = new URL(absolutizeUrl(href));
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      if (host === "youtu.be") return normalizeYouTubeId(url.pathname.split("/").filter(Boolean)[0]);
      if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) return "";
      if (url.pathname.startsWith("/watch")) return normalizeYouTubeId(url.searchParams.get("v"));
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live", "v"].includes(parts[0])) return normalizeYouTubeId(parts[1]);
      return "";
    } catch {
      return "";
    }
  }

  function normalizeYouTubeId(value) {
    const id = String(value || "").trim();
    return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : "";
  }

  function getYouTubeStartSeconds(href) {
    try {
      const url = new URL(absolutizeUrl(href));
      return parseYouTubeTime(url.searchParams.get("start") || url.searchParams.get("t") || "");
    } catch {
      return 0;
    }
  }

  function parseYouTubeTime(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (/^\d+$/.test(raw)) return Number(raw);
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (!match) return 0;
    return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
  }

  function resolveModalPdfViewer(modal, link) {
    const visibleFrame = modal.querySelector(".epr-modal-panel-pdf iframe");
    if (!visibleFrame) return;

    const source = absolutizeUrl(link.href);
    if (!source || isPdfHref(source)) {
      setPdfFrameSource(visibleFrame, source || link.href);
      return;
    }

    const cached = pdfResolverCache.get(source);
    if (cached) {
      setPdfFrameSource(visibleFrame, cached);
      return;
    }

    const resolver = document.createElement("iframe");
    resolver.className = "epr-pdf-resolver";
    resolver.setAttribute("aria-hidden", "true");
    resolver.tabIndex = -1;
    resolver.src = source;
    root.appendChild(resolver);

    let done = false;
    let attempts = 0;
    let timer = 0;
    const finish = (resolvedUrl) => {
      if (done) return;
      done = true;
      if (timer) clearInterval(timer);
      resolver.remove();
      const finalUrl = resolvedUrl || source;
      pdfResolverCache.set(source, finalUrl);
      if (document.contains(visibleFrame)) setPdfFrameSource(visibleFrame, finalUrl);
    };

    const tryResolve = () => {
      attempts += 1;
      const resolvedUrl = findPdfUrlInFrame(resolver, source);
      if (resolvedUrl || attempts >= 24) finish(resolvedUrl);
    };

    resolver.addEventListener("load", tryResolve);
    timer = setInterval(tryResolve, 250);
    resolvePdfUrlFromFetch(source).then((resolvedUrl) => {
      if (resolvedUrl) finish(resolvedUrl);
    }).catch(() => {});
  }

  function setPdfFrameSource(frame, href) {
    frame.setAttribute("src", withPdfViewerOptions(href));
  }

  function findPdfUrlInFrame(frame, originalUrl) {
    let doc;
    try {
      doc = frame.contentDocument;
    } catch {
      return "";
    }
    if (!doc) return "";

    const candidates = [
      ...Array.from(doc.querySelectorAll("embed[src], iframe[src], object[data], a[href]")).map((node) => {
        return node.getAttribute("src") || node.getAttribute("data") || node.getAttribute("href") || "";
      }),
      ...extractPdfUrlsFromText(doc.documentElement?.innerHTML || "")
    ].map((href) => absolutizeUrl(href, originalUrl)).filter(Boolean);

    return candidates.find((href) => isPdfHref(href))
      || candidates.find((href) => /\/pdf|pdf\/|\.pdf|blob:/i.test(href) && href !== originalUrl)
      || "";
  }

  async function resolvePdfUrlFromFetch(source) {
    const response = await fetch(source, { credentials: "include" });
    if (!response.ok) return "";
    const text = await response.text();
    return extractPdfUrlsFromText(text).map((href) => absolutizeUrl(href, source)).find(Boolean) || "";
  }

  function extractPdfUrlsFromText(text) {
    return Array.from(String(text).matchAll(/https?:\\?\/\\?\/[^"'<>\\\s]+?\.pdf(?:\?[^"'<>\\\s]*)?/gi))
      .map((match) => match[0].replaceAll("\\/", "/"));
  }

  function absolutizeUrl(href, base = location.href) {
    try {
      return new URL(href, base).href;
    } catch {
      return "";
    }
  }

  function isPdfLink(link) {
    return Boolean(link?.isPdf) || isPdfHref(link?.href || "");
  }

  function isLikelyPdfPost(post) {
    if (!post?.links?.length) return false;
    const normalized = removeAccents(post.text.toLowerCase());
    return /(^|\n|\s)pdf(\s|\n|$)/i.test(normalized);
  }

  function isOpaqueLinkLabel(label) {
    const compact = String(label || "").trim();
    return /^[a-z0-9_-]{10,}$/i.test(compact) && !/\s/.test(compact);
  }

  function isPdfHref(href) {
    try {
      const url = new URL(href, location.href);
      return /\.pdf$/i.test(url.pathname) || /(?:^|[?&])(type|format|filetype)=pdf(?:&|$)/i.test(url.search);
    } catch {
      return /\.pdf(?:$|[?#])/i.test(href);
    }
  }

  function withPdfViewerOptions(href) {
    const options = "view=FitH&zoom=page-width&navpanes=0";
    if (!href) return href;
    const [base, hash = ""] = String(href).split("#");
    const params = new URLSearchParams(hash);
    for (const [key, value] of new URLSearchParams(options)) {
      if (!params.has(key)) params.set(key, value);
    }
    const fragment = params.toString();
    return fragment ? `${base}#${fragment}` : base;
  }

  function readableUrlLabel(href) {
    try {
      const url = new URL(href, location.href);
      const lastPart = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname);
      return lastPart.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ") || url.hostname;
    } catch {
      return href;
    }
  }

  function handleKeyboard(event) {
    if (event.key === "Escape" && els.status.classList.contains("epr-open")) {
      event.preventDefault();
      closeStatusMenu();
      return;
    }
    if (event.key === "Escape" && els.section.classList.contains("epr-open")) {
      event.preventDefault();
      closeSectionMenu();
      return;
    }
    if (state.modalIndex < 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closePostModal();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showAdjacentPost(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showAdjacentPost(1);
    }
  }

  function stripDuplicateTitle(text, title) {
    return text.startsWith(title) ? text.slice(title.length).trim() || text : text;
  }

  function isPadletUiChrome(text) {
    const normalized = removeAccents(text.toLowerCase());
    return [
      "appuyez sur echap pour quitter cette fenetre",
      "volet de discussion avec l'ia",
      "aller au contenu",
      "inscrivez-vous sur padlet",
      "vous n'avez pas l'autorisation necessaire"
    ].some((fragment) => normalized.includes(fragment));
  }

  function looksLikeBoardContainer(text) {
    const normalized = removeAccents(text.toLowerCase());
    const sectionCount = BOARD_SECTION_TITLES.filter((title) => {
      return normalized.includes(removeAccents(title.toLowerCase()));
    }).length;
    const dateLineCount = text.split("\n").filter(isDateOnlyLine).length;
    return sectionCount >= 4 || (sectionCount >= 3 && dateLineCount >= 2);
  }

  function hasMultiplePostDescendants(node) {
    const descendants = [...node.querySelectorAll("article, [role='article'], [data-testid*='post' i], [data-test-id*='post' i], [class*='post' i]")]
      .filter((child) => child !== node && child instanceof HTMLElement && !root.contains(child) && isVisible(child))
      .map((child) => compactForCompare(child.innerText || child.textContent || ""))
      .filter((text) => text.length >= 24);
    if (descendants.length < 2) return false;

    const uniqueDescendants = descendants.filter((text, index, arr) => arr.findIndex((other) => other === text || other.includes(text) || text.includes(other)) === index);
    return uniqueDescendants.length >= 2;
  }

  function hasDate(text) {
    const normalized = removeAccents(text.toLowerCase());
    return /\b20\d{2}-\d{1,2}-\d{1,2}\b/.test(normalized) || /\b\d{1,2}[\/.-]\d{1,2}/.test(normalized) || /\b\d{1,2}(?:er)?\s+(janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\b/.test(normalized);
  }

  function isDateOnlyLine(line) {
    return /^\s*(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s*$/.test(removeAccents(line.toLowerCase()));
  }

  function isVisible(node) {
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
  }

  function cleanText(text) {
    return text.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function compactForCompare(text) {
    return removeAccents(cleanText(text).toLowerCase()).replace(/\s+/g, " ");
  }

  function normalizeSection(section) {
    const normalized = section.toUpperCase();
    if (["TPS", "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2"].includes(normalized)) return normalized;
    return section;
  }

  function removeAccents(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseInputDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function uniqueByContent(post, index, arr) {
    return arr.findIndex((other) => other.id === post.id) === index;
  }

  function removeAggregatePosts(posts) {
    return posts.filter((post) => {
      if (isAggregateLikePost(post)) return false;
      const text = compactForCompare(post.text);
      const containedPosts = posts.filter((other) => {
        if (other === post) return false;
        const otherText = compactForCompare(other.text);
        return otherText.length >= 40 && text.includes(otherText);
      });
      return containedPosts.length < 2;
    });
  }

  function isAggregateLikePost(post) {
    return looksLikeBoardContainer(post.text);
  }

  function removeContainedPosts(posts) {
    return posts.filter((post) => {
      const text = compactForCompare(post.text);
      return !posts.some((other) => {
        if (other === post) return false;
        const otherText = compactForCompare(other.text);
        if (!otherText.includes(text) || otherText.length < text.length * 1.25) return false;
        return hasRelatedTitle(post, other) || sameDateKey(post, other) || isLowInformationPost(post);
      });
    });
  }

  function hasRelatedTitle(post, other) {
    const title = compactForCompare(post.title);
    const otherTitle = compactForCompare(other.title);
    return title.length >= 8 && (otherTitle.includes(title) || title.includes(otherTitle));
  }

  function sameDateKey(post, other) {
    return post.dateKey && post.dateKey === other.dateKey;
  }

  function isLowInformationPost(post) {
    const text = compactForCompare(post.text);
    return text.length < 220 || /\b(pdf|forms\.cloud\.microsoft|microsoft forms)\b/i.test(text);
  }

  function hash(value) {
    let result = 0;
    for (let index = 0; index < value.length; index += 1) {
      result = Math.imul(31, result) + value.charCodeAt(index) | 0;
    }
    return String(result);
  }

  function limit(value, max) {
    return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }
})();
