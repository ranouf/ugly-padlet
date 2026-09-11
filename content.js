(() => {
  const APP_ID = "elan-padlet-reader";
  const TEST_PAGE = "ugly-padlet-test.html";
  const CACHE_ENABLED = true;
  const APP_VERSION = getExtensionVersion("2.0.29");
  const UPDATE_STORAGE_KEY = "uglyPadletUpdateAvailable";
  const STATUS_OPTIONS = [
    ["all", "Toutes"],
    ["upcoming", "A venir"],
    ["past", "Deja passees"],
    ["new", "Nouvelles"],
  ];
  const TODAY = startOfDay(new Date());
  const MONTHS = new Map([
    ["janvier", 0],
    ["janv", 0],
    ["fevrier", 1],
    ["fevr", 1],
    ["février", 1],
    ["févr", 1],
    ["mars", 2],
    ["avril", 3],
    ["avr", 3],
    ["mai", 4],
    ["juin", 5],
    ["juillet", 6],
    ["juil", 6],
    ["aout", 7],
    ["août", 7],
    ["septembre", 8],
    ["sept", 8],
    ["octobre", 9],
    ["oct", 9],
    ["novembre", 10],
    ["nov", 10],
    ["decembre", 11],
    ["dec", 11],
    ["décembre", 11],
    ["déc", 11],
  ]);
  const SECTION_KEYWORDS = [
    "TPS",
    "PS",
    "MS",
    "GS",
    "CP",
    "CE1",
    "CE2",
    "CM1",
    "CM2",
    "Maternelle",
    "Elementaire",
    "Élémentaire",
    "Primaire",
    "Ecole",
    "École",
    "Cantine",
    "Garderie",
    "Periscolaire",
    "Périscolaire",
    "Sortie",
    "Parents",
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
    "Rentrée 2026",
  ];

  const isTestPage = location.href.includes(TEST_PAGE);
  const testBoardPath = getTestBoardPath(isTestPage);
  if (
    (!isSupportedPadletPage() && !isTestPage) ||
    document.getElementById(APP_ID)
  )
    return;
  const BOARD_PATH =
    testBoardPath || (isTestPage ? location.pathname : getCurrentBoardPath());
  const STORAGE_SCOPE = getBoardStorageScope(BOARD_PATH, isTestPage);
  const CACHE_KEY = `uglyPadlet:${STORAGE_SCOPE}:posts:v5`;
  const FILTER_CACHE_KEY = `uglyPadlet:${STORAGE_SCOPE}:filters:v1`;
  const CONNECTION_DATE_KEY = `uglyPadlet:${STORAGE_SCOPE}:lastConnectionDate:v1`;
  const CURRENT_CONNECTION_DATE_KEY = `uglyPadlet:${STORAGE_SCOPE}:currentConnectionDate:v1`;
  const USE_PADLET_WISH_URLS = !isTestPage || Boolean(testBoardPath);
  const previousConnectionDate = initializeConnectionDate();
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
      stableRounds: 0,
    },
    cacheLoaded: false,
    loadedFromApi: false,
    pendingSections: [],
    cachedLatestDate: null,
    visiblePosts: [],
    modalIndex: -1,
    modalImageIndex: 0,
    modalSwipeManager: null,
    isWallCommentable:
      window.__uglyPadletStartingState?.wall?.is_commentable !== false,
    currentUserHashid: cleanText(
      window.__uglyPadletStartingState?.user?.hashid || "",
    ),
    canModerateComments: Boolean(
      window.__uglyPadletStartingState?.canIModerate,
    ),
    modalCommentsRefreshKey: "",
    commentsByPost: new Map(),
    commentsLoadingByPost: new Set(),
    commentsSubmittingByPost: new Set(),
    commentsEditingById: new Set(),
    commentsDeletingById: new Set(),
    commentErrorsByPost: new Map(),
    pendingModalRequest: readModalRequestFromUrl(),
    previousConnectionDate,
  };
  const pdfResolverCache = new Map();

  const root = document.createElement("div");
  const newsletterSignupUrl = `https://padlet.com/auth/signup?referrer=${encodeURIComponent(`${location.origin}${BOARD_PATH}`)}`;
  root.id = APP_ID;
  root.dataset.wallCommentable = String(state.isWallCommentable);
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
          <button type="button" class="epr-icon-action epr-refresh-action" data-action="rescan" aria-label="Actualiser les communications" title="Actualiser les communications">
            ${renderIcon("arrow-counterclockwise")}
          </button>
          <a class="epr-icon-action epr-newsletter-action" href="${escapeHtml(newsletterSignupUrl)}" data-action="open-newsletter" aria-label="S'inscrire a la newsletter du Padlet" title="S'inscrire a la newsletter du Padlet">
            ${renderIcon("bell-plus")}
          </a>
          <button type="button" class="epr-icon-action epr-padlet-action" data-action="toggle-original" aria-label="Voir le Padlet original" title="Voir le Padlet original" aria-pressed="false">
            <span class="epr-padlet-icon" aria-hidden="true"></span>
          </button>
          <button type="button" class="epr-filter-toggle" data-action="toggle-filter-panel" aria-expanded="false" aria-controls="epr-filter-fields">
            ${renderIcon("filter")}
            <span class="epr-filter-count" hidden>0</span>
          </button>
        </div>
      </header>

      <section class="epr-filters" aria-label="Filtres">
        <div class="epr-filter-fields" id="epr-filter-fields">
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
                ${STATUS_OPTIONS.map(
                  ([value, label]) => `
                  <button type="button" class="epr-single-select-option" data-action="set-status" data-status-value="${escapeHtml(value)}" role="menuitemradio" aria-checked="false">
                    <span>${escapeHtml(label)}</span>
                  </button>
                `,
                ).join("")}
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
        <span class="epr-version-group">
          <span class="epr-version" aria-label="Version de l'extension">UglyPadlet v${escapeHtml(APP_VERSION)}</span>
          <span class="epr-update-available" role="status" tabindex="0" hidden>
            ${renderIcon("arrow-up-circle")}
          </span>
        </span>
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
    filterToggle: root.querySelector(".epr-filter-toggle"),
    filterCount: root.querySelector(".epr-filter-count"),
    filterFields: root.querySelector(".epr-filter-fields"),
    rescan: root.querySelector('[data-action="rescan"]'),
    toggle: root.querySelector('[data-action="toggle-original"]'),
    customScrollbar: root.querySelector("[data-custom-scrollbar]"),
    customScrollbarThumb: root.querySelector("[data-custom-scrollbar-thumb]"),
  };
  let scrollbarUpdateFrame = 0;
  let scrollbarDrag = null;
  let refreshCompletionTimer = 0;
  let refreshProgressFrame = 0;
  let displayedRefreshProgress = 0;

  whenBodyReady().then(initializeReader);

  function initializeReader() {
    restoreFilters();
    initializeUpdateIndicator();
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
    root.addEventListener("submit", (event) => {
      if (event.target.matches(".epr-comment-edit-form")) {
        event.preventDefault();
        submitEditComment(event.target);
        return;
      }
      if (!event.target.matches(".epr-comment-form")) return;
      event.preventDefault();
      submitModalComment(event.target);
    });
    root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!event.target.closest("[data-section-filter]")) closeSectionMenu();
      if (!event.target.closest("[data-status-filter]")) closeStatusMenu();
      if (!event.target.closest(".epr-calendar-event")) closeCalendarMenus();
      if (action === "rescan") startFullLoad();
      if (action === "toggle-original") toggleOriginal();
      if (action === "toggle-filter-panel") toggleFilterPanel();
      if (action === "reset-filters") resetFilters();
      if (action === "toggle-calendar-menu") {
        event.preventDefault();
        toggleCalendarMenu(event.target.closest(".epr-calendar-event"));
      }
      if (action === "toggle-status-menu") toggleStatusMenu();
      if (action === "set-status")
        setStatusFilter(
          event.target.closest("[data-status-value]")?.dataset.statusValue ||
            "all",
        );
      if (action === "toggle-section-menu") toggleSectionMenu();
      if (action === "clear-sections") setSelectedSections([]);
      if (action === "toggle-section")
        toggleSelectedSection(
          event.target.closest("[data-section-value]")?.dataset.sectionValue ||
            "",
        );
      if (action === "close-modal") closePostModal();
      if (action === "previous-post") showAdjacentPost(-1);
      if (action === "next-post") showAdjacentPost(1);
      if (action === "previous-image") showAdjacentImage(-1);
      if (action === "next-image") showAdjacentImage(1);
      if (action === "edit-comment")
        startEditComment(
          event.target.closest("[data-comment-id]")?.dataset.commentId || "",
        );
      if (action === "cancel-edit-comment")
        cancelEditComment(
          event.target.closest("[data-comment-id]")?.dataset.commentId || "",
        );
      if (action === "delete-comment")
        deleteModalComment(
          event.target.closest("[data-comment-id]")?.dataset.commentId || "",
        );

      const card = event.target.closest(".epr-card[data-post-id]");
      if (
        card &&
        !event.target.closest("a, button, summary, .epr-calendar-event")
      ) {
        openPostModal(card.dataset.postId);
      }
    });
    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) {
        closeStatusMenu();
        closeSectionMenu();
        closeCalendarMenus();
      }
    });
    document.addEventListener("keydown", handleKeyboard);
    root.addEventListener("scroll", queueCustomScrollbarUpdate, {
      passive: true,
    });
    window.addEventListener("resize", queueCustomScrollbarUpdate);
    els.customScrollbar.addEventListener(
      "pointerdown",
      handleCustomScrollbarPointerDown,
    );
    els.customScrollbar.addEventListener(
      "pointermove",
      handleCustomScrollbarPointerMove,
    );
    els.customScrollbar.addEventListener(
      "pointerup",
      handleCustomScrollbarPointerEnd,
    );
    els.customScrollbar.addEventListener(
      "pointercancel",
      handleCustomScrollbarPointerEnd,
    );
    els.customScrollbarThumb.addEventListener(
      "pointermove",
      handleCustomScrollbarPointerMove,
    );
    els.customScrollbarThumb.addEventListener(
      "pointerup",
      handleCustomScrollbarPointerEnd,
    );
    els.customScrollbarThumb.addEventListener(
      "pointercancel",
      handleCustomScrollbarPointerEnd,
    );
    window.addEventListener("popstate", syncModalFromUrl);
    window.addEventListener("hashchange", syncModalFromUrl);

    const observer = new MutationObserver(
      debounce(() => scanAndRender(false), 650),
    );
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

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
    if (state.loadedFromApi) return;
    const posts = extractPosts();
    const signature = posts
      .map((post) => `${post.title}|${post.text.length}|${post.dateKey}`)
      .join("::");
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
    const startedWithoutPosts = state.posts.length === 0;
    if (reset) {
      state.postMap.clear();
      state.posts = [];
      state.lastSignature = "";
      state.cacheLoaded = false;
      state.cachedLatestDate = null;
      state.loadedFromApi = false;
    }

    state.isLoadingAll = true;
    root.classList.toggle("epr-loading", state.posts.length === 0);
    syncRefreshControl();
    state.loadMessage = "Chargement complet du Padlet...";
    updateLoadProgress({
      found: 0,
      total: detectExpectedPostCount(),
      percent: 0,
      round: 0,
      maxRounds: 0,
      stableRounds: 0,
    });
    render();

    try {
      await loadAllPadletPosts();
    } finally {
      state.loadMessage = "";
      updateLoadProgress({
        found: state.posts.length,
        total: Math.max(state.loadProgress.total || 0, state.posts.length),
        percent: 100,
      });
      if (startedWithoutPosts) await wait(220);
      state.isLoadingAll = false;
      root.classList.remove("epr-loading");
      syncRefreshControl();
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
    if (state.isLoadingAll || state.isCheckingRecent || !state.cachedLatestDate)
      return;

    state.isCheckingRecent = true;
    state.loadMessage = "Recherche des nouvelles publications...";
    updateLoadProgress({
      found: state.posts.length,
      total: 0,
      percent: 0,
      round: 0,
      maxRounds: 0,
      stableRounds: 0,
    });
    syncRefreshControl();
    render();

    try {
      const refreshedFromApi = await loadAllPadletPostsFromApi();
      if (!refreshedFromApi) {
        await loadRecentPadletPosts(state.cachedLatestDate);
      }
    } finally {
      state.loadMessage = "";
      updateLoadProgress({
        found: state.posts.length,
        total: state.posts.length,
        percent: 100,
      });
      state.isCheckingRecent = false;
      syncRefreshControl();
      state.posts = finalizePosts([...state.postMap.values()]).sort(
        comparePosts,
      );
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
    updateLoadProgress({
      found: state.posts.length,
      total: expectedTotal,
      round: 0,
      maxRounds,
      stableRounds,
    });

    try {
      for (let round = 0; round < maxRounds; round += 1) {
        state.loadMessage = `Chargement complet du Padlet... ${state.posts.length} trouvee${state.posts.length > 1 ? "s" : ""}`;
        updateLoadProgress({
          found: state.posts.length,
          total: expectedTotal,
          round,
          maxRounds,
          stableRounds,
        });
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

        updateLoadProgress({
          found: state.posts.length,
          total: expectedTotal,
          round: round + 1,
          maxRounds,
          stableRounds,
        });

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
      state.posts = finalizePosts([...state.postMap.values()]).sort(
        comparePosts,
      );
      updateSections();
      updateLoadProgress({
        found: state.posts.length,
        total: 0,
        round: 1,
        maxRounds,
        stableRounds,
      });
      render();

      for (let round = 0; round < maxRounds; round += 1) {
        state.loadMessage = `Recherche des nouvelles publications... ${state.posts.length} en cache`;
        render();

        const moved = advanceLazyScroll(round);
        await wait(320);
        mergeRecentPosts(extractPosts(), cutoffDate);
        state.posts = finalizePosts([...state.postMap.values()]).sort(
          comparePosts,
        );
        updateSections();

        if (state.posts.length === lastCount) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
          lastCount = state.posts.length;
        }

        updateLoadProgress({
          found: state.posts.length,
          total: 0,
          round: round + 1,
          maxRounds,
          stableRounds,
        });

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
    updateLoadProgress({ percent: 3 });
    if (
      location.href.includes(TEST_PAGE) &&
      !new URLSearchParams(location.search).has("api-test")
    )
      return false;

    const wallHashid = await waitForPadletWallHashid();
    updateLoadProgress({ percent: 8 });
    root.dataset.wallHashid = wallHashid;
    if (!wallHashid) {
      state.loadedFromApi = false;
      root.dataset.loadSource = "dom";
      root.dataset.apiError = "wall_hashid not found";
      return false;
    }

    await withLoadProgressPulse(() => loadPadletStartingState(), 8, 18);

    try {
      const wishes = [];
      let pageStart = "";
      let wallId = "";

      for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
        const url = `https://padlet.com/api/10/wishes?wall_hashid=${encodeURIComponent(wallHashid)}&page_start=${encodeURIComponent(pageStart)}&v=`;
        const payload = await withLoadProgressPulse(
          async () => {
            const response = await fetch(url, { credentials: "include" });
            if (!response.ok)
              throw new Error(`Padlet wishes API ${response.status}`);
            return response.json();
          },
          Math.max(18, state.loadProgress.percent),
          82,
        );
        const pageWishes = Array.isArray(payload.data) ? payload.data : [];
        wishes.push(...pageWishes);
        wallId ||=
          pageWishes.find((wish) => wish?.attributes?.wall_id)?.attributes
            ?.wall_id || "";

        state.loadMessage = `Chargement API Padlet... ${wishes.length} publication${wishes.length > 1 ? "s" : ""} trouvee${wishes.length > 1 ? "s" : ""}`;
        pageStart = payload.meta?.next || "";
        updateLoadProgress({
          found: wishes.length,
          total: Math.max(state.loadProgress.total || 0, wishes.length),
          percent: pageStart
            ? Math.max(
                state.loadProgress.percent || 0,
                Math.min(90, 84 + pageIndex),
              )
            : 90,
          round: pageIndex + 1,
          maxRounds: 0,
          stableRounds: 0,
        });
        render();

        if (!pageStart) break;
      }

      if (!wishes.length) {
        state.loadedFromApi = false;
        return false;
      }

      const sectionMap = await withLoadProgressPulse(
        () => fetchPadletSectionMap(wallId),
        90,
        94,
      );
      const posts = wishes
        .map((wish, index) => apiWishToPost(wish, sectionMap, index))
        .filter(Boolean);
      updateLoadProgress({
        found: wishes.length,
        total: Math.max(state.loadProgress.total || 0, wishes.length),
        percent: 98,
      });
      if (!posts.length) {
        state.loadedFromApi = false;
        return false;
      }

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
      console.warn(
        "UglyPadlet API loading failed, falling back to DOM scan.",
        error,
      );
      state.loadedFromApi = false;
      root.dataset.loadSource = "dom";
      root.dataset.apiError = String(error?.message || error);
      return false;
    }
  }

  async function loadPadletStartingState() {
    const startingState = await fetchPadletStartingState();
    state.isWallCommentable = startingState?.wall?.is_commentable !== false;
    state.currentUserHashid = cleanText(startingState?.user?.hashid || "");
    state.canModerateComments = Boolean(startingState?.canIModerate);
    root.dataset.wallCommentable = String(state.isWallCommentable);
  }

  async function fetchPadletStartingState() {
    if (window.__uglyPadletStartingState)
      return window.__uglyPadletStartingState;

    const startingStateUrl = await waitForPadletStartingStateUrl();
    if (!startingStateUrl) return null;

    try {
      const response = await fetch(startingStateUrl, {
        credentials: "include",
      });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  async function waitForPadletStartingStateUrl() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const url = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((entry) => entry.includes("/api/11/padlet_starting_state"));
      if (url) return url;
      await wait(250);
    }
    return "";
  }
  async function fetchPadletSectionMap(wallId) {
    const sectionMap = new Map();
    if (!wallId) return sectionMap;

    try {
      const response = await fetch(
        `https://padlet.com/api/5/wall_sections?wall_id=${encodeURIComponent(wallId)}&`,
        { credentials: "include" },
      );
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
    const title = chooseMeaningfulText(
      attributes.subject,
      attributes.headline,
      attributes.attachment_link?.title,
      "Communication",
    );
    const body = cleanText(
      htmlToText(attributes.body || attributes.wish_content?.body || ""),
    );
    const rawAttachmentTitle = cleanText(
      htmlToText(
        attributes.attachment_caption ||
          attributes.attachment_link?.title ||
          "",
      ),
    );
    const attachmentTitle = isImageAttachmentTitle(
      rawAttachmentTitle,
      attributes,
    )
      ? ""
      : rawAttachmentTitle;
    const links = apiWishLinks(attributes, title);
    const images = apiWishImages(attributes);
    const isSeparator = isTitleOnlyPost({
      body,
      attachmentTitle,
      links,
      images,
    });
    const textParts = [title, body, attachmentTitle].filter(Boolean);
    const text = cleanText(textParts.join("\n\n"));
    if (!title || !text) return null;

    const dates = extractDates(text);
    const publishedAt = readPadletPublishedDate(attributes);
    const primaryDate = publishedAt
      ? startOfDay(publishedAt)
      : choosePrimaryDate(dates);
    const sectionId = String(attributes.wall_section_id || "");
    const apiId = String(
      attributes.hashid || wish.id || attributes.id || hash(text),
    );

    return {
      id: `padlet-${apiId}`,
      index,
      title: limit(title, 110),
      text,
      isSeparator,
      section: sectionMap.get(sectionId) || "Non classee",
      urlSlug: normalizeWishSlug(attributes.hashid || ""),
      commentUrl: normalizePadletCommentUrl(attributes.permalink || ""),
      commentPostId: Number(attributes.id || wish.id) || null,
      commentWishHashid: String(attributes.hashid || ""),
      dates: dates.length ? dates : primaryDate ? [primaryDate] : [],
      date: primaryDate,
      dateKey: primaryDate ? formatDateKey(primaryDate) : "",
      publishedAt,
      links,
      images,
    };
  }

  function apiWishLinks(attributes, title) {
    const attachmentUrls = apiWishAttachmentUrls(attributes);
    const candidates = [
      {
        href: attributes.attachment,
        label:
          attributes.attachment_caption ||
          attributes.attachment_link?.title ||
          title,
      },
      {
        href: attributes.attachment_link?.url,
        label:
          attributes.attachment_link?.title ||
          attributes.attachment_caption ||
          title,
      },
      ...(Array.isArray(attributes.attachments)
        ? attributes.attachments.map((attachment) => ({
            href:
              attachment.url ||
              attachment.download_url ||
              attachment.attachment,
            label: attachment.title || attachment.name || title,
          }))
        : []),
    ];

    return candidates
      .filter((link) => link.href)
      .filter((link) => typeof link.href === "string")
      .filter(
        (link) =>
          !attachmentUrls.some(
            (attachment) => attachment.href === link.href && attachment.isImage,
          ),
      )
      .map((link) => ({
        href: link.href,
        label: limit(
          cleanText(htmlToText(link.label || readableUrlLabel(link.href))),
          90,
        ),
        isPdf: isPdfHref(link.href) || /\.pdf(?:$|[?#])/i.test(link.href),
      }))
      .filter(
        (link, index, links) =>
          links.findIndex((other) => other.href === link.href) === index,
      )
      .slice(0, 6);
  }

  function apiWishAttachmentUrls(attributes) {
    const attachmentLink = attributes.attachment_link || {};
    const sources = [
      attributes.attachment,
      attachmentLink,
      ...(Array.isArray(attributes.attachments) ? attributes.attachments : []),
      attributes.wish_content?.attachment_props,
    ];

    return sources
      .flatMap((source) => apiAttachmentUrlCandidates(source))
      .filter((candidate) => candidate.href)
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex((other) => other.href === candidate.href) ===
          index,
      );
  }

  function apiAttachmentUrlCandidates(source) {
    if (!source) return [];
    if (typeof source === "string")
      return [{ href: source, isImage: isImageHref(source) }];
    if (Array.isArray(source))
      return source.flatMap(apiAttachmentUrlCandidates);
    if (typeof source !== "object") return [];

    const looksLikeImage =
      /^image\//i.test(source.content_type || "") ||
      /^(?:photo|image)$/i.test(source.content_category || "");
    const urls = [
      source.url,
      source.canonical_url,
      source.display_url,
      source.download_url,
      source.attachment,
      source.attachment_url,
      source.thumbnail_url,
      source.preview_url,
      source.preview_image?.url,
      source.provider_image?.url,
    ];

    return urls.map((href) => ({
      href,
      isImage:
        isImageHref(href) ||
        (looksLikeImage &&
          !/storage\.googleapis\.com\/padlet-assets\/image\/favicon\.ico/i.test(
            String(href || ""),
          )),
    }));
  }

  function apiWishImages(attributes) {
    return apiWishAttachmentUrls(attributes)
      .filter((attachment) => attachment.isImage)
      .map((attachment) => attachment.href)
      .filter(
        (src, index, images) =>
          images.findIndex(
            (image) =>
              mediaDeduplicationKey(image) === mediaDeduplicationKey(src),
          ) === index,
      )
      .slice(0, 12);
  }

  function isImageAttachmentTitle(title, attributes) {
    const label = cleanText(title || "");
    if (!label) return false;

    const hasImageAttachment = apiWishAttachmentUrls(attributes).some(
      (attachment) => attachment.isImage,
    );
    const compact = removeAccents(label.toLowerCase()).replace(/\s+/g, "");
    const looksLikeImageFilename =
      /\.(?:png|jpe?g|gif|webp|heic|heif)$/i.test(label) ||
      /^(?:pxl|img|dsc|dscn|image|photo)[_.-]?\d{4,}/i.test(compact);

    return hasImageAttachment && looksLikeImageFilename;
  }

  function findPadletWallHashid() {
    const resourceMatch = performance
      .getEntriesByType("resource")
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
    return cleanText(
      template.content.textContent || template.innerHTML || String(value || ""),
    ).replace(/([.!?])(?=[A-ZÀ-ÖØ-Þ])/g, "$1 ");
  }

  function updateLoadProgress(partial) {
    const previousPercent = state.loadProgress.percent || 0;
    state.loadProgress = {
      ...state.loadProgress,
      ...partial,
    };

    const total = state.loadProgress.total || 0;
    const found = state.loadProgress.found || 0;
    const scanPercent = state.loadProgress.maxRounds
      ? Math.round(
          (state.loadProgress.round / state.loadProgress.maxRounds) * 96,
        )
      : 0;
    const totalPercent = total
      ? Math.min(99, Math.round((found / total) * 100))
      : 0;
    state.loadProgress.percent =
      typeof partial.percent === "number"
        ? partial.percent
        : Math.max(previousPercent, scanPercent, totalPercent);

    updateLoader();
  }

  async function withLoadProgressPulse(task, start, end) {
    updateLoadProgress({
      percent: Math.max(state.loadProgress.percent || 0, start),
    });
    const timer = window.setInterval(() => {
      const current = state.loadProgress.percent || 0;
      if (current >= end) return;
      updateLoadProgress({
        percent: Math.min(end, current + Math.max(0.8, (end - current) * 0.12)),
      });
    }, 120);

    try {
      return await task();
    } finally {
      window.clearInterval(timer);
      updateLoadProgress({
        percent: Math.max(state.loadProgress.percent || 0, end),
      });
    }
  }

  function updateLoader() {
    if (!els.loader) return;
    const progress = state.loadProgress;
    const foundLabel = `${progress.found} communication${progress.found > 1 ? "s" : ""} trouvee${progress.found > 1 ? "s" : ""}`;
    const totalLabel = progress.total
      ? ` sur ${progress.total} attendue${progress.total > 1 ? "s" : ""}`
      : "";
    const detail = progress.total
      ? "Le total detecte vient des donnees exposees par Padlet au chargement."
      : "Total Padlet non expose clairement, balayage complet en cours.";

    els.loader.style.setProperty(
      "--epr-loader-progress",
      `${Math.max(0, Math.min(100, progress.percent || 0)) * 3.6}deg`,
    );
    animateRefreshProgress(progress.percent || 0);
    els.loaderPercent.textContent =
      progress.total || progress.percent >= 100
        ? `${Math.round(progress.percent || 0)}%`
        : "...";
    els.loaderFound.textContent = `${foundLabel}${totalLabel}`;
    els.loaderDetail.textContent = progress.stableRounds
      ? `${detail} Stabilisation ${progress.stableRounds}/6.`
      : detail;
    syncRefreshControl();
  }

  function detectExpectedPostCount() {
    const numbers = [
      detectExpectedPostCountFromJson(),
      detectExpectedPostCountFromText(),
    ].filter((value) => Number.isFinite(value) && value > 0 && value < 1000);
    return numbers.length ? Math.max(...numbers) : 0;
  }

  function detectExpectedPostCountFromText() {
    const text = cleanText(document.body?.innerText || "");
    const candidates = [
      ...text.matchAll(/\+\s*(\d{1,3})\s*[\u2022•]\s*\d+\s*jours?/gi),
      ...text.matchAll(/(\d{1,3})\s+publications?/gi),
      ...text.matchAll(/(\d{1,3})\s+communications?/gi),
      ...text.matchAll(/sur\s+(\d{1,3})/gi),
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
      /"wishCount"\s*:\s*(\d{1,3})/g,
    ];

    patterns.forEach((pattern) => {
      for (const match of html.matchAll(pattern))
        candidates.push(Number(match[1]));
    });

    return candidates.length ? Math.max(...candidates) : 0;
  }

  function mergePosts(posts) {
    posts.forEach((post) => {
      const key = getPostKey(post);
      const existing = state.postMap.get(key);
      if (
        !existing ||
        post.text.length > existing.text.length ||
        post.images.length > existing.images.length
      ) {
        state.postMap.set(key, { ...post, id: key });
      }
    });
  }

  function mergeRecentPosts(posts, cutoffDate) {
    mergePosts(posts.filter((post) => isRecentEnough(post, cutoffDate)));
  }

  function isRecentEnough(post, cutoffDate) {
    const postDate = post.publishedAt || post.date;
    if (!postDate || !cutoffDate) return false;
    return startOfDay(postDate) >= startOfDay(cutoffDate);
  }

  function finalizePosts(posts) {
    return removeAggregatePosts(
      removeContainedPosts(
        posts
          .filter(uniqueByContent)
          .filter((post) => !isAggregateLikePost(post)),
      ),
    );
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
      const validSources = isTestPage ? ["api", "test"] : ["api"];
      if (!validSources.includes(cached.source)) return false;
      if (!Array.isArray(cached.posts) || !cached.posts.length) return false;

      state.postMap.clear();
      cached.posts
        .map(restoreCachedPost)
        .filter(Boolean)
        .forEach((post) => {
          state.postMap.set(getPostKey(post), post);
        });
      state.posts = finalizePosts([...state.postMap.values()]).sort(
        comparePosts,
      );
      state.cacheLoaded = true;
      state.loadedFromApi = cached.source === "api";
      state.cachedLatestDate = getLatestPostDate(state.posts);
      updateSections();
      render();
      return true;
    } catch {
      return false;
    }
  }

  function saveCachedPosts() {
    if (!CACHE_ENABLED || (!state.loadedFromApi && !isTestPage)) return;
    try {
      const payload = {
        source: state.loadedFromApi ? "api" : "test",
        savedAt: new Date().toISOString(),
        posts: state.posts.map(cachePost),
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
      isSeparator: Boolean(post.isSeparator),
      section: post.section,
      urlSlug: post.urlSlug || "",
      commentUrl: post.commentUrl || "",
      commentPostId: post.commentPostId || null,
      commentWishHashid: post.commentWishHashid || "",
      date: post.date ? post.date.toISOString() : "",
      dates: post.dates.map((date) => date.toISOString()),
      dateKey: post.dateKey,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : "",
      links: post.links,
      images: post.images.filter((src) => !src.startsWith("data:")),
    };
  }

  function restoreCachedPost(post) {
    if (!post || !post.text || !post.title) return null;
    const dates = Array.isArray(post.dates)
      ? post.dates
          .map((value) => new Date(value))
          .filter((date) => !Number.isNaN(date.getTime()))
      : [];
    const date = post.date ? new Date(post.date) : null;
    const publishedAt = post.publishedAt ? new Date(post.publishedAt) : null;
    return {
      id: post.id || hash(post.text),
      index: Number(post.index) || 0,
      title: post.title,
      text: post.text,
      isSeparator: Boolean(post.isSeparator),
      section: post.section || "Non classee",
      urlSlug: post.urlSlug || "",
      commentUrl: normalizePadletCommentUrl(post.commentUrl || ""),
      commentPostId: Number(post.commentPostId) || null,
      commentWishHashid: String(post.commentWishHashid || ""),
      dates,
      date: date && !Number.isNaN(date.getTime()) ? date : null,
      dateKey: post.dateKey || "",
      publishedAt:
        publishedAt && !Number.isNaN(publishedAt.getTime())
          ? publishedAt
          : null,
      links: Array.isArray(post.links)
        ? post.links.map(normalizeCachedLink).filter(Boolean)
        : [],
      images: Array.isArray(post.images) ? post.images : [],
    };
  }

  function getLatestPostDate(posts) {
    const dates = getCommunicationPosts(posts)
      .map((post) => post.publishedAt || post.date)
      .filter(Boolean);
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }

  function advanceLazyScroll(round) {
    const targets = getScrollableTargets();
    let moved = false;

    targets.forEach((target) => {
      const maxLeft = Math.max(0, target.scrollWidth - target.clientWidth);
      const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
      const nextLeft = maxLeft
        ? Math.min(maxLeft, Math.round(round * target.clientWidth * 0.8))
        : 0;
      const verticalRound = maxLeft ? round % 7 : round;
      const nextTop = maxTop
        ? Math.min(
            maxTop,
            Math.round(verticalRound * target.clientHeight * 0.7),
          )
        : 0;

      if (
        Math.abs(target.scrollLeft - nextLeft) > 2 ||
        Math.abs(target.scrollTop - nextTop) > 2
      ) {
        target.scrollLeft = nextLeft;
        target.scrollTop = nextTop;
        moved = true;
      }
    });

    window.scrollTo(
      Math.round(round * window.innerWidth * 0.75),
      Math.round((round % 7) * window.innerHeight * 0.7),
    );
    document.dispatchEvent(new Event("scroll"));
    return moved;
  }

  function getScrollableTargets() {
    const candidates = [
      document.scrollingElement,
      document.documentElement,
      document.body,
    ];
    document
      .querySelectorAll(
        "main, section, div, [role='main'], [role='list'], [data-testid], [class]",
      )
      .forEach((node) => {
        if (node instanceof HTMLElement && !root.contains(node))
          candidates.push(node);
      });

    return [...new Set(candidates)]
      .filter((node) => node && node instanceof Element && !root.contains(node))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 80) return false;
        return (
          node.scrollWidth > node.clientWidth + 40 ||
          node.scrollHeight > node.clientHeight + 40
        );
      })
      .sort(
        (a, b) =>
          b.scrollWidth * b.scrollHeight - a.scrollWidth * a.scrollHeight,
      )
      .slice(0, 24);
  }

  function rememberScrollPositions() {
    return getScrollableTargets().map((target) => ({
      target,
      left: target.scrollLeft,
      top: target.scrollTop,
    }));
  }

  function restoreScrollPositions(positions) {
    positions.forEach(({ target, left, top }) => {
      if (
        target?.isConnected ||
        target === document.scrollingElement ||
        target === document.body ||
        target === document.documentElement
      ) {
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
      state.status = STATUS_OPTIONS.some(([value]) => value === filters.status)
        ? filters.status
        : "all";
      state.sections = normalizeSelectedSections(
        filters.sections || filters.section,
      );
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
      localStorage.setItem(
        FILTER_CACHE_KEY,
        JSON.stringify({
          query: state.query,
          status: state.status,
          section: state.sections.length === 1 ? state.sections[0] : "all",
          sections: state.sections,
          from: state.from,
          to: state.to,
        }),
      );
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
    syncMobileFilterControls();
  }

  function syncStatusFilterControls() {
    const label = getStatusFilterLabel();
    els.status.classList.toggle(
      "epr-single-select-active",
      state.status !== "all",
    );
    els.statusToggle.setAttribute("aria-label", label);
    els.statusLabel.textContent = label;
    els.statusMenu.querySelectorAll("[data-status-value]").forEach((option) => {
      const checked = option.dataset.statusValue === state.status;
      option.classList.toggle("epr-selected", checked);
      option.setAttribute("aria-checked", String(checked));
    });
  }

  function getStatusFilterLabel() {
    return (
      STATUS_OPTIONS.find(([value]) => value === state.status)?.[1] || "Toutes"
    );
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
    state.status = STATUS_OPTIONS.some(([value]) => value === status)
      ? status
      : "all";
    closeStatusMenu();
    saveFilters();
    syncStatusFilterControls();
    render();
  }

  function normalizeSelectedSections(value) {
    if (Array.isArray(value))
      return [
        ...new Set(
          value
            .map((section) => cleanText(section))
            .filter(Boolean)
            .filter((section) => section !== "all"),
        ),
      ];
    if (typeof value === "string" && value && value !== "all") return [value];
    return [];
  }

  function syncSectionFilterControls() {
    const selected = new Set(state.sections);
    els.section.classList.toggle("epr-multi-select-active", selected.size > 0);
    els.sectionToggle.setAttribute("aria-label", getSectionFilterLabel());
    els.sectionLabel.textContent = getSectionFilterLabel();
    els.sectionMenu
      .querySelectorAll("[data-section-value]")
      .forEach((option) => {
        const checked = selected.has(option.dataset.sectionValue);
        option.classList.toggle("epr-selected", checked);
        option.setAttribute("aria-checked", String(checked));
      });
    const allOption = els.sectionMenu.querySelector(
      "[data-action='clear-sections']",
    );
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

  function toggleCalendarMenu(eventElement) {
    if (!eventElement) return;
    const isOpen = eventElement.classList.contains("epr-calendar-open");
    closeCalendarMenus(eventElement);
    setCalendarMenuOpen(eventElement, !isOpen);
  }

  function closeCalendarMenus(exceptElement = null) {
    root.querySelectorAll(".epr-calendar-open").forEach((eventElement) => {
      if (eventElement !== exceptElement)
        setCalendarMenuOpen(eventElement, false);
    });
  }

  function setCalendarMenuOpen(eventElement, isOpen) {
    eventElement.classList.toggle("epr-calendar-open", isOpen);
    eventElement
      .querySelector(".epr-calendar-trigger")
      ?.setAttribute("aria-expanded", String(isOpen));
    const menu = eventElement.querySelector(".epr-calendar-menu");
    if (menu) menu.hidden = !isOpen;
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
      if (attempt < 20)
        setTimeout(() => ensureResetListRendered(attempt + 1), 250);
      return;
    }
    if (!state.posts.length) return;

    const communicationPosts = getCommunicationPosts(state.posts);
    const renderedCards = els.list.querySelectorAll(".epr-card").length;
    if (
      renderedCards === communicationPosts.length &&
      !els.list.querySelector(".epr-empty")
    )
      return;

    state.visiblePosts = communicationPosts;
    els.summary.textContent = renderSummary(
      communicationPosts,
      communicationPosts.length,
    );
    els.list.innerHTML = communicationPosts.map(renderPost).join("");
    queueCustomScrollbarUpdate();
  }

  function hasActiveFilters() {
    return Boolean(
      state.query.trim() ||
      state.status !== "all" ||
      state.sections.length ||
      state.from ||
      state.to,
    );
  }

  function getActiveFilterCount() {
    return [
      state.query.trim(),
      state.status !== "all",
      state.sections.length,
      state.from,
      state.to,
    ].filter(Boolean).length;
  }

  function renderSummary(posts, total) {
    const count = posts.length;
    const label = hasActiveFilters()
      ? `${count}/${total} communications`
      : `${total} communication${total > 1 ? "s" : ""}`;
    const newCount = posts.filter(isNewPost).length;
    const newSuffix = newCount
      ? ` dont ${newCount} nouvelle${newCount > 1 ? "s" : ""} depuis la derniere connexion le ${formatLastConnectionDate()}`
      : "";
    return `${label}${newSuffix}.`;
  }

  function formatLastConnectionDate() {
    return state.previousConnectionDate.toLocaleDateString("fr-CA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function toggleFilterPanel() {
    root.classList.toggle("epr-filters-open");
    syncMobileFilterControls();
  }

  function syncMobileFilterControls() {
    const isOpen = root.classList.contains("epr-filters-open");
    const count = getActiveFilterCount();
    els.filterToggle.setAttribute("aria-expanded", String(isOpen));
    els.filterToggle.setAttribute(
      "aria-label",
      count ? `Filtres, ${count} actif${count > 1 ? "s" : ""}` : "Filtres",
    );
    els.filterCount.hidden = count === 0;
    els.filterCount.textContent = String(count);
    root.classList.toggle("epr-has-active-filters", count > 0);
  }

  function isInputDate(value) {
    return (
      typeof value === "string" &&
      (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value))
    );
  }

  function toggleOriginal() {
    if (!state.showOriginal) {
      const toggleRect = els.toggle.getBoundingClientRect();
      root.style.setProperty(
        "--epr-original-toggle-top",
        `${Math.round(toggleRect.top)}px`,
      );
      root.style.setProperty(
        "--epr-original-toggle-right",
        `${Math.round(window.innerWidth - toggleRect.right)}px`,
      );
    }
    state.showOriginal = !state.showOriginal;
    root.classList.toggle("epr-minimized", state.showOriginal);
    setReaderScrollLock(!state.showOriginal);
    els.toggle.classList.toggle("epr-icon-action", !state.showOriginal);
    els.toggle.classList.toggle("epr-padlet-action", !state.showOriginal);
    els.toggle.classList.toggle("epr-reader-return-action", state.showOriginal);
    els.toggle.innerHTML = state.showOriginal
      ? `${renderIcon("arrow-left")}<span>Revenir au lecteur</span>`
      : '<span class="epr-padlet-icon" aria-hidden="true"></span>';
    const label = state.showOriginal
      ? "Revenir au lecteur"
      : "Voir le Padlet original";
    els.toggle.setAttribute("aria-label", label);
    els.toggle.setAttribute("title", label);
    els.toggle.setAttribute("aria-pressed", String(state.showOriginal));
  }

  function syncRefreshControl() {
    const refreshing = state.isLoadingAll || state.isCheckingRecent;
    els.rescan.classList.toggle("epr-refreshing", refreshing);
    if (refreshing) {
      window.clearTimeout(refreshCompletionTimer);
      refreshCompletionTimer = 0;
      els.rescan.classList.remove("epr-refresh-complete");
    } else if (
      state.loadProgress.percent >= 100 &&
      !els.rescan.classList.contains("epr-refresh-complete")
    ) {
      els.rescan.classList.add("epr-refresh-complete");
      refreshCompletionTimer = window.setTimeout(() => {
        els.rescan.classList.remove("epr-refresh-complete");
        animateRefreshProgress(0);
        refreshCompletionTimer = 0;
      }, 1200);
    }
    els.rescan.setAttribute("aria-busy", String(refreshing));
    els.rescan.setAttribute(
      "aria-label",
      refreshing
        ? "Actualisation des communications en cours"
        : "Actualiser les communications",
    );
    els.rescan.title = refreshing
      ? "Actualisation des communications en cours"
      : "Actualiser les communications";
  }

  function animateRefreshProgress(value) {
    const target = Math.max(0, Math.min(100, value));
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.cancelAnimationFrame(refreshProgressFrame);

    if (target === 0 || reduceMotion) {
      displayedRefreshProgress = target;
      els.rescan.style.setProperty("--epr-refresh-progress", `${target}%`);
      refreshProgressFrame = 0;
      return;
    }

    const start = displayedRefreshProgress;
    const startedAt = performance.now();
    const duration = 600;
    const update = (now) => {
      const ratio = Math.min(1, (now - startedAt) / duration);
      displayedRefreshProgress = start + (target - start) * ratio;
      els.rescan.style.setProperty(
        "--epr-refresh-progress",
        `${displayedRefreshProgress}%`,
      );
      refreshProgressFrame =
        ratio < 1 ? window.requestAnimationFrame(update) : 0;
    };
    refreshProgressFrame = window.requestAnimationFrame(update);
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

  function initializeUpdateIndicator() {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;

    chrome.storage.local.get(UPDATE_STORAGE_KEY, (result) => {
      setUpdateIndicator(result[UPDATE_STORAGE_KEY]);
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[UPDATE_STORAGE_KEY]) return;
      setUpdateIndicator(changes[UPDATE_STORAGE_KEY].newValue);
    });
  }

  function setUpdateIndicator(update) {
    const indicator = root.querySelector(".epr-update-available");
    const version = cleanText(update?.version || "");
    indicator.hidden = !version;
    if (!version) return;

    const message = `Une nouvelle version d'UglyPadlet (v${version}) est disponible. Le navigateur l'installera automatiquement des que possible.`;
    indicator.setAttribute("aria-label", message);
    indicator.title = message;
  }

  function isSupportedPadletPage() {
    if (location.hostname !== "padlet.com") return false;
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return false;
    return !["api", "auth", "dashboard"].includes(segments[0].toLowerCase());
  }

  function getCurrentBoardPath() {
    const segments = location.pathname.split("/").filter(Boolean);
    return `/${segments.slice(0, 2).join("/")}`;
  }

  function getTestBoardPath(isTestPage) {
    if (!isTestPage) return "";
    const boardPath = new URLSearchParams(location.search).get("boardPath");
    if (!boardPath) return "";
    const segments = boardPath.split("/").filter(Boolean);
    return `/${segments.slice(0, 2).join("/")}`;
  }

  function getBoardStorageScope(boardPath, isTestPage) {
    if (isTestPage) return "ecoleElan";
    return boardPath
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
  }

  function findOriginalBackground() {
    const selectors = [
      "body",
      "main",
      "[style*='background-image']",
      "[class*='background' i]",
      "[class*='wallpaper' i]",
      "[class*='surface' i]",
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
      "[class*='post' i]",
    ];
    const candidates = new Set();

    explicitSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (isPostCandidate(node)) candidates.add(node);
      });
    });

    if (candidates.size < 3) {
      document
        .querySelectorAll(
          "main div, section div, [role='listitem'], [data-testid], [class]",
        )
        .forEach((node) => {
          if (isPostCandidate(node)) candidates.add(node);
        });
    }

    const posts = [
      ...removeDuplicateContainers(removeNestedCandidates([...candidates])),
    ]
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
    if (looksLikeBoardContainer(text) || hasMultiplePostDescendants(node))
      return false;
    const hasMediaContent = Boolean(node.querySelector("img, video"));
    const hasHeading = Boolean(node.querySelector("h1, h2, h3"));
    if (
      (text.length < 24 && !(hasMediaContent && hasHeading)) ||
      text.length > 7000
    )
      return false;
    if (rect.width < 120 || rect.height < 45) return false;

    const descriptor = `${node.tagName} ${node.className || ""} ${node.getAttribute("data-testid") || ""} ${node.getAttribute("aria-label") || ""}`;
    const isTitleOnlyCandidate =
      text.length >= 4 &&
      text.length <= 160 &&
      /article|post|card|subject|wish|surface|cell/i.test(descriptor) &&
      node.querySelector("h1, h2, h3") &&
      !node.querySelector("p, img, video, a[href]") &&
      !hasDate(text);
    if (isTitleOnlyCandidate) return true;

    const score = [
      /article|post|card|subject|wish|surface|cell/i.test(descriptor),
      hasDate(text),
      node.querySelector("img, video, a[href]"),
      text.split("\n").length >= 2,
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
      const childCandidates = nodes.filter(
        (other) => other !== node && node.contains(other),
      );
      if (childCandidates.length < 2) return true;

      const meaningfulChildren = childCandidates
        .map((child) => compactForCompare(child.innerText || ""))
        .filter((text) => text.length >= 24 && nodeText.includes(text));
      if (meaningfulChildren.length < 2) return true;

      const longestChild = Math.max(
        ...meaningfulChildren.map((text) => text.length),
      );
      return !(nodeText.length > longestChild * 1.35);
    });
  }

  function readPost(node, index) {
    const fullText = cleanText(node.innerText || node.textContent || "");
    if (!fullText) return null;
    if (looksLikeBoardContainer(fullText)) return null;

    const dates = extractDates(fullText);
    const primaryDate = choosePrimaryDate(dates);
    const section = findSection(node, fullText);
    const links = [...node.querySelectorAll("a[href]")]
      .map((link) => normalizeLink(link))
      .filter(Boolean)
      .filter((link) => !isImageHref(link.href))
      .filter(
        (link, idx, arr) =>
          arr.findIndex((other) => other.href === link.href) === idx,
      )
      .slice(0, 4);
    const images = [...node.querySelectorAll("img")]
      .map((img) => img.currentSrc || img.src)
      .filter((src) => src && !/avatar|profile|emoji|icon/i.test(src))
      .filter((src, idx, arr) => arr.indexOf(src) === idx)
      .slice(0, 12);
    const lines = fullText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const titleNode = node.querySelector(
      "h1, h2, h3, strong, b, [data-testid*='title' i]",
    );
    const title = chooseMeaningfulText(
      titleNode?.innerText,
      lines.find((line) => line.length >= 4 && !isDateOnlyLine(line)),
      links[0]?.label,
      "Communication",
    );

    return {
      id: hash(fullText),
      index,
      title: limit(title, 110),
      text: fullText,
      isSeparator: isTitleOnlyPost({
        body: getPostBodyCandidate(title, fullText),
        attachmentTitle: "",
        links,
        images,
      }),
      section,
      urlSlug: findPadletWishSlug(node),
      commentUrl: findPadletWishUrl(node),
      commentPostId:
        Number(node.getAttribute("data-padlet-post-id")) ||
        Number(node.getAttribute("data-post-id")) ||
        null,
      commentWishHashid: getCommentWishHashidFromSlug(findPadletWishSlug(node)),
      dates,
      date: primaryDate,
      dateKey: primaryDate ? formatDateKey(primaryDate) : "",
      publishedAt: primaryDate,
      links,
      images,
    };
  }

  function findSection(node, text) {
    const detected = SECTION_KEYWORDS.find((keyword) =>
      new RegExp(`(^|\\W)${escapeRegExp(keyword)}(\\W|$)`, "i").test(text),
    );
    if (detected) return normalizeSection(detected);

    let current = node.parentElement;
    for (
      let depth = 0;
      current && depth < 5;
      depth += 1, current = current.parentElement
    ) {
      const heading = [...current.children].find((child) => {
        return (
          !child.contains(node) &&
          child.matches?.("h1, h2, h3, [role='heading'], [aria-label]")
        );
      });
      const label = cleanText(
        heading?.innerText ||
          heading?.getAttribute("aria-label") ||
          current.getAttribute("aria-label") ||
          "",
      );
      if (
        label &&
        label.length <= 45 &&
        !/padlet|partager|connexion/i.test(label)
      )
        return label;
    }

    return "Non classee";
  }

  function findPadletWishSlug(node) {
    const values = [];
    [
      node,
      ...node.querySelectorAll(
        "a[href], [href], [data-href], [data-url], [data-share-url]",
      ),
    ].forEach((element) => {
      ["href", "data-href", "data-url", "data-share-url"].forEach(
        (attribute) => {
          const value = element.getAttribute?.(attribute);
          if (value) values.push(value);
        },
      );
    });

    for (const value of values) {
      const slug = extractWishSlug(value);
      if (slug) return slug;
    }
    return "";
  }

  function findPadletWishUrl(node) {
    const link = [...node.querySelectorAll("a[href]")]
      .map((anchor) => anchor.href)
      .find((href) => extractWishSlug(href));
    return normalizePadletCommentUrl(link || "");
  }

  function readModalRequestFromUrl() {
    const url = new URL(location.href);
    const slug = extractWishSlug(url.pathname);
    if (slug) return { type: "slug", value: slug };

    const postId =
      url.searchParams.get("uglyPost") ||
      new URLSearchParams(url.hash.replace(/^#/, "")).get("uglyPost");
    return postId ? { type: "id", value: postId } : null;
  }

  function extractWishSlug(value) {
    const match = String(value || "").match(/\/wish\/([^/?#]+)/i);
    return match ? normalizeWishSlug(decodeURIComponent(match[1])) : "";
  }

  function normalizeWishSlug(value) {
    return String(value || "")
      .trim()
      .replace(/^post_/i, "");
  }

  function normalizePadletCommentUrl(value) {
    const url = absolutizeUrl(value);
    if (!url || !extractWishSlug(url)) return "";
    return url;
  }

  function extractDates(text) {
    const normalized = removeAccents(text.toLowerCase());
    const dates = [];
    const numeric = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/g;
    const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
    const written =
      /\b(\d{1,2})(?:er)?\s+(janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+(\d{2,4}))?\b/g;

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

    return dates.filter(
      (date, index, arr) =>
        arr.findIndex((other) => sameDay(other, date)) === index,
    );
  }

  function readPadletPublishedDate(attributes) {
    const candidates = [
      attributes.published_at,
      attributes.scheduled_at,
      attributes.created_at,
      attributes.updated_at,
      attributes.content_updated_at,
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
    return date;
  }

  function normalizeYear(value, month) {
    if (value) {
      const year = Number(value);
      return year < 100 ? 2000 + year : year;
    }
    const schoolYears = readSchoolYears();
    if (schoolYears) return month >= 7 ? schoolYears.start : schoolYears.end;
    const currentYear = TODAY.getFullYear();
    return month >= 7 ? currentYear : currentYear + 1;
  }

  function readSchoolYears() {
    const source = `${BOARD_PATH} ${getPadletTitle()}`;
    const match = source.match(/(20\d{2})\s*-\s*(20\d{2})/);
    if (!match) return null;
    return { start: Number(match[1]), end: Number(match[2]) };
  }

  function pushValidDate(dates, year, month, day) {
    const date = new Date(year, month, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    ) {
      dates.push(startOfDay(date));
    }
  }

  function choosePrimaryDate(dates) {
    if (!dates.length) return null;
    const upcoming = dates
      .filter((date) => date >= TODAY)
      .sort((a, b) => a - b);
    if (upcoming.length) return upcoming[0];
    return dates.sort((a, b) => b - a)[0];
  }

  function comparePosts(a, b) {
    const aDate = a.publishedAt || a.date;
    const bDate = b.publishedAt || b.date;
    if (aDate && bDate) return bDate - aDate;
    if (aDate) return -1;
    if (bDate) return 1;
    return a.index - b.index;
  }

  function updateSections() {
    const current = new Set(
      state.pendingSections.length ? state.pendingSections : state.sections,
    );
    const sections = [
      ...new Set(
        getCommunicationPosts(state.posts)
          .map((post) => post.section)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "fr"));
    state.sections = sections.filter((section) => current.has(section));
    state.pendingSections = [...state.sections];
    els.sectionMenu.innerHTML =
      `
      <button type="button" class="epr-multi-select-option" data-action="clear-sections" role="checkbox">
        <span class="epr-checkbox-mark" aria-hidden="true"></span>
        <span>Toutes les sections</span>
      </button>
    ` +
      sections
        .map((section) => {
          return `
        <button type="button" class="epr-multi-select-option" data-action="toggle-section" data-section-value="${escapeHtml(section)}" role="checkbox">
          <span class="epr-checkbox-mark" aria-hidden="true"></span>
          <span>${escapeHtml(section)}</span>
        </button>
      `;
        })
        .join("");
    syncFilterControls();
  }

  function render() {
    try {
      const filtered = getCommunicationPosts(state.posts).filter(
        matchesFilters,
      );
      state.visiblePosts = filtered;
      els.summary.textContent = renderSummary(
        filtered,
        getCommunicationPosts(state.posts).length,
      );

      if (state.isLoadingAll && !state.posts.length) {
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
      syncMobileFilterControls();
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
    if (
      !els.customScrollbar ||
      !els.customScrollbarThumb ||
      state.showOriginal
    ) {
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
    const thumbHeight = Math.min(
      trackHeight,
      Math.max(
        48,
        Math.round(trackHeight * (root.clientHeight / root.scrollHeight)),
      ),
    );
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxThumbTop
      ? Math.round((root.scrollTop / maxScroll) * maxThumbTop)
      : 0;
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
      startTop: thumbRect.top - trackRect.top,
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
    const nextTop = clamp(
      scrollbarDrag.startTop + event.clientY - scrollbarDrag.startY,
      0,
      maxThumbTop,
    );
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
    const nextTop = clamp(
      clientY - trackRect.top - thumbHeight / 2,
      0,
      maxThumbTop,
    );
    root.scrollTop = maxThumbTop ? (nextTop / maxThumbTop) * maxScroll : 0;
    updateCustomScrollbar();
  }

  function getCommunicationPosts(posts) {
    return posts.filter((post) => !post.isSeparator);
  }

  function isTitleOnlyPost({ body, attachmentTitle, links, images }) {
    return !body && !attachmentTitle && !links.length && !images.length;
  }

  function getPostBodyCandidate(title, text) {
    const titleText = cleanText(title || "");
    const bodyText = cleanText(text || "");
    return cleanText(bodyText.replace(titleText, ""));
  }
  function matchesFilters(post) {
    const query = removeAccents(state.query.trim().toLowerCase());
    const linkText = post.links
      .map((link) => `${link.label} ${link.href}`)
      .join(" ");
    if (
      query &&
      !removeAccents(
        `${post.title} ${post.text} ${post.section} ${linkText}`.toLowerCase(),
      ).includes(query)
    )
      return false;
    if (state.sections.length && !state.sections.includes(post.section))
      return false;
    if (state.status === "past" && (!post.date || post.date >= TODAY))
      return false;
    if (state.status === "upcoming" && (!post.date || post.date < TODAY))
      return false;
    if (state.status === "new" && !isNewPost(post)) return false;
    if (state.from && (!post.date || post.date < parseInputDate(state.from)))
      return false;
    if (state.to && (!post.date || post.date > parseInputDate(state.to)))
      return false;
    return true;
  }

  function renderPost(post) {
    const dateLabel = post.date
      ? post.date.toLocaleDateString("fr-CA", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "Date non detectee";
    const body = renderFormattedText(
      getPostBodyText(post, { omitLinkLabels: true }),
      { post, calendar: true },
    );
    const displayLinks = getDisplayLinks(post);
    const hasPdf = displayLinks.some(isPdfLink);
    const videoLink = displayLinks.find(isEmbeddedVideoLink);
    const links = renderLinks(displayLinks);
    const images =
      hasPdf || videoLink
        ? ""
        : post.images
            .map(
              (src) => `<img src="${escapeHtml(src)}" alt="" loading="lazy">`,
            )
            .join("");

    return `
      <article class="epr-card" data-post-id="${escapeHtml(post.id)}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHtml(post.title)}">
        <div class="epr-card-meta">
          <span class="epr-date-badge">${renderNewBadge(post)}${escapeHtml(dateLabel)}</span>
          ${renderSectionBadge(post.section)}
        </div>
        <h2>${escapeHtml(post.title)}</h2>
        ${videoLink ? renderVideoViewer(videoLink, { compact: true }) : ""}
        ${images ? `<div class="epr-images">${images}</div>` : ""}
        ${body ? `<p>${body}</p>` : ""}
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
    state.modalCommentsRefreshKey = "";
    destroyModalSwipe();
    root.querySelector(".epr-modal")?.remove();
    if (updateUrl) updateUrlForBoard();
  }

  function showAdjacentPost(direction, { updateUrl = true } = {}) {
    if (state.modalIndex < 0 || !state.visiblePosts.length) return;
    state.modalIndex =
      (state.modalIndex + direction + state.visiblePosts.length) %
      state.visiblePosts.length;
    state.modalImageIndex = 0;
    if (updateUrl) updateUrlForPost(state.visiblePosts[state.modalIndex]);
    renderPostModal();
  }

  function showAdjacentImage(direction) {
    const post = state.visiblePosts[state.modalIndex];
    if (!post || post.images.length < 2) return;
    state.modalImageIndex =
      (state.modalImageIndex + direction + post.images.length) %
      post.images.length;
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
    const requestedSlug =
      request.type === "slug" ? normalizeWishSlug(request.value) : "";

    const index = state.visiblePosts.findIndex((post) => {
      if (request.type === "slug")
        return normalizeWishSlug(post.urlSlug) === requestedSlug;
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
    url.pathname = useWishUrl
      ? `${BOARD_PATH.replace(/\/$/, "")}/wish/${encodeURIComponent(post.urlSlug)}`
      : BOARD_PATH;
    if (useWishUrl) {
      url.searchParams.delete("uglyPost");
      url.hash = "";
    } else {
      url.searchParams.set("uglyPost", post.id);
      url.hash = "";
    }
    pushUrlIfChanged(url);
    state.pendingModalRequest = useWishUrl
      ? { type: "slug", value: post.urlSlug }
      : { type: "id", value: post.id };
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
    if (next !== location.href)
      history.pushState({ uglyPadlet: true }, "", next);
  }

  function renderPostModal() {
    const post = state.visiblePosts[state.modalIndex];
    if (!post) {
      closePostModal();
      return;
    }

    const pdfLink = getDisplayLinks(post).find(isPdfLink);
    destroyModalSwipe();
    root.querySelector(".epr-modal")?.remove();
    const modal = document.createElement("div");
    modal.className = pdfLink ? "epr-modal epr-modal-pdf" : "epr-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", post.title);
    const commentsKey = canUseCommentPanel(post) ? getCommentKey(post) : "";
    const shouldRefreshComments = Boolean(
      commentsKey && state.modalCommentsRefreshKey !== commentsKey,
    );
    if (shouldRefreshComments) state.modalCommentsRefreshKey = commentsKey;
    const commentsPanel = renderCommentsPanel(post);
    const modalControls = `
      <div class="epr-modal-controls">
        <div class="epr-modal-nav-group" aria-label="Navigation entre les publications">
          <button type="button" class="epr-modal-nav epr-modal-prev" data-action="previous-post" aria-label="Publication precedente">${renderIcon("chevron-left")}</button>
          <button type="button" class="epr-modal-nav epr-modal-next" data-action="next-post" aria-label="Publication suivante">${renderIcon("chevron-right")}</button>
        </div>
        <button type="button" class="epr-modal-close" data-action="close-modal" aria-label="Fermer">${renderIcon("x-lg")}</button>
      </div>
    `;
    const panel = pdfLink
      ? `
      <article class="epr-modal-panel epr-modal-panel-pdf">
        <header class="epr-modal-header">
          <div>
            <div class="epr-card-meta">
              <span class="epr-date-badge">${renderNewBadge(post)}${escapeHtml(post.date ? post.date.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date non detectee")}</span>
              ${renderSectionBadge(post.section)}
              <span class="epr-count-badge">${state.modalIndex + 1} / ${state.visiblePosts.length}</span>
            </div>
            <h2>${escapeHtml(post.title)}</h2>
          </div>
          ${modalControls}
        </header>
        <div class="epr-modal-layout${commentsPanel ? " epr-modal-layout-comments" : ""}">
          <div class="epr-modal-main">
            ${renderModalActions(post)}
            ${renderPdfDescription(post)}
            ${renderPdfFrame(pdfLink)}
          </div>
          ${commentsPanel}
        </div>
      </article>
    `
      : `
      <article class="epr-modal-panel">
        <header class="epr-modal-header">
          <div>
            <div class="epr-card-meta">
              <span class="epr-date-badge">${renderNewBadge(post)}${escapeHtml(post.date ? post.date.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date non detectee")}</span>
              ${renderSectionBadge(post.section)}
              <span class="epr-count-badge">${state.modalIndex + 1} / ${state.visiblePosts.length}</span>
            </div>
            <h2>${escapeHtml(post.title)}</h2>
          </div>
          ${modalControls}
        </header>
        <div class="epr-modal-layout${commentsPanel ? " epr-modal-layout-comments" : ""}">
          <div class="epr-modal-main">
            ${renderModalActions(post)}
            <div class="epr-modal-body">
              ${renderPostBody(post)}
            </div>
          </div>
          ${commentsPanel}
        </div>
      </article>
    `;
    modal.innerHTML = `
      <div class="epr-modal-backdrop" data-action="close-modal"></div>
      ${panel}
    `;
    root.appendChild(modal);
    if (pdfLink) resolveModalPdfViewer(modal, pdfLink);
    loadCommentsForVisiblePost({ force: shouldRefreshComments });
    enableModalSwipe(modal);
    modal.querySelector(".epr-modal-close")?.focus();
  }

  function enableModalSwipe(modal) {
    if (!shouldEnableModalSwipe()) return;

    const manager = new Hammer.Manager(modal);
    manager.add(
      new Hammer.Swipe({
        direction: Hammer.DIRECTION_HORIZONTAL,
        threshold: 34,
        velocity: 0.25,
      }),
    );
    manager.on("swipeleft", () => showAdjacentPost(1));
    manager.on("swiperight", () => showAdjacentPost(-1));
    modal.dataset.swipe = "hammerjs";
    state.modalSwipeManager = manager;
  }

  function shouldEnableModalSwipe() {
    return window.matchMedia("(max-width: 640px)").matches;
  }
  function destroyModalSwipe() {
    state.modalSwipeManager?.destroy();
    state.modalSwipeManager = null;
  }

  function renderPostBody(post) {
    const body = renderFormattedText(
      getPostBodyText(post, { omitLinkLabels: true }),
      { post, calendar: true },
    );
    const displayLinks = getDisplayLinks(post);
    const links = renderLinks(displayLinks);
    const pdfLink = displayLinks.find(isPdfLink);
    const videoLink = displayLinks.find(isEmbeddedVideoLink);
    return `
      ${pdfLink ? renderPdfViewer(pdfLink) : ""}
      ${!pdfLink && videoLink ? renderVideoViewer(videoLink) : ""}
      ${!pdfLink && !videoLink ? renderImageGallery(post) : ""}
      ${body ? `<p class="epr-post-text">${body}</p>` : ""}
      ${links ? `<div class="epr-links">${links}</div>` : ""}
    `;
  }

  function renderModalActions(post) {
    const commentUrl = getCommentUrl(post);
    if (!commentUrl || !state.isWallCommentable || canUseCommentPanel(post))
      return "";

    return `
      <div class="epr-modal-actions">
        <a class="epr-comment-link" href="${escapeHtml(commentUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Commenter cette publication sur Padlet dans un nouvel onglet">
          ${renderIcon("chat-left-text")}
          <span>Commenter sur Padlet</span>
        </a>
      </div>
    `;
  }

  function canUseCommentPanel(post) {
    return Boolean(
      state.isWallCommentable &&
      post.commentPostId &&
      getCommentWishHashid(post),
    );
  }

  function renderCommentsPanel(post) {
    if (!canUseCommentPanel(post)) return "";
    const key = getCommentKey(post);
    const comments = state.commentsByPost.get(key);
    const isLoading = state.commentsLoadingByPost.has(key);
    const isSubmitting = state.commentsSubmittingByPost.has(key);
    const error = state.commentErrorsByPost.get(key) || "";
    const commentItems = Array.isArray(comments)
      ? comments.map(renderComment).join("")
      : "";

    return `
      <aside class="epr-comments-panel" aria-label="Commentaires">
        <div class="epr-comments-header">
          ${renderIcon("chat-left-text")}
          <h3>Commentaires</h3>
        </div>
        <div class="epr-comments-list">
          ${
            isLoading
              ? `<p class="epr-comments-empty">Chargement des commentaires...</p>`
              : commentItems ||
                `<p class="epr-comments-empty">Aucun commentaire pour le moment.</p>`
          }
        </div>
        <form class="epr-comment-form" data-post-id="${escapeHtml(post.id)}">
          <label for="epr-comment-input-${escapeHtml(post.id)}">Ajouter un commentaire</label>
          <textarea id="epr-comment-input-${escapeHtml(post.id)}" name="comment" rows="4" placeholder="Votre commentaire"></textarea>
          ${error ? `<p class="epr-comment-error">${escapeHtml(error)}</p>` : ""}
          <button type="submit" ${isSubmitting ? "disabled" : ""}>
            ${renderIcon("chat-left-text")}
            <span>${isSubmitting ? "Envoi..." : "Publier"}</span>
          </button>
        </form>
      </aside>
    `;
  }

  function renderComment(comment) {
    const isEditing = state.commentsEditingById.has(comment.id);
    const isDeleting = state.commentsDeletingById.has(comment.id);
    const author = escapeHtml(comment.author || "Padlet");
    const date = comment.createdAt
      ? escapeHtml(
          comment.createdAt.toLocaleDateString("fr-CA", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        )
      : "";
    if (isEditing) {
      return `
        <article class="epr-comment epr-comment-editing" data-comment-id="${escapeHtml(comment.id)}">
          <form class="epr-comment-edit-form" data-comment-id="${escapeHtml(comment.id)}">
            <textarea name="comment" rows="3" aria-label="Modifier le commentaire">${escapeHtml(comment.body)}</textarea>
            <div class="epr-comment-edit-actions">
              <button type="submit">Enregistrer</button>
              <button type="button" data-action="cancel-edit-comment">Annuler</button>
            </div>
          </form>
        </article>
      `;
    }

    return `
      <article class="epr-comment" data-comment-id="${escapeHtml(comment.id)}">
        <div class="epr-comment-meta">
          <strong>${author}</strong>
          ${date ? `<span>${date}</span>` : ""}
        </div>
        <p>${renderFormattedText(comment.body)}</p>
        ${renderCommentActions(comment, isDeleting)}
      </article>
    `;
  }

  function renderCommentActions(comment, isDeleting) {
    const actions = [];
    if (comment.canEdit) {
      actions.push(
        `<button type="button" data-action="edit-comment">Modifier</button>`,
      );
    }
    if (comment.canDelete) {
      actions.push(
        `<button type="button" data-action="delete-comment" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Suppression..." : "Supprimer"}</button>`,
      );
    }
    if (!actions.length) return "";
    return `<div class="epr-comment-actions">${actions.join('<span aria-hidden="true">&middot;</span>')}</div>`;
  }

  function loadCommentsForVisiblePost({ force = false } = {}) {
    const post = state.visiblePosts[state.modalIndex];
    if (!post || !canUseCommentPanel(post)) return;
    loadCommentsForPost(post, { force });
  }

  async function loadCommentsForPost(post, { force = false } = {}) {
    const key = getCommentKey(post);
    if (
      state.commentsLoadingByPost.has(key) ||
      (!force && state.commentsByPost.has(key))
    )
      return;

    state.commentsLoadingByPost.add(key);
    rerenderActiveModal(post);
    try {
      const response = await fetch(
        `https://padlet.com/api/9/comments?wish_hashid=${encodeURIComponent(getCommentWishHashid(post))}&page_start=`,
        { credentials: "include" },
      );
      const payload = await response.json();
      const comments = (Array.isArray(payload.data) ? payload.data : [])
        .map(apiCommentToComment)
        .filter(Boolean);
      state.commentsByPost.set(key, comments);
      state.commentErrorsByPost.delete(key);
    } catch {
      state.commentsByPost.set(key, []);
      state.commentErrorsByPost.set(
        key,
        "Impossible de charger les commentaires.",
      );
    } finally {
      state.commentsLoadingByPost.delete(key);
      rerenderActiveModal(post);
    }
  }

  async function submitModalComment(form) {
    const post = state.posts.find(
      (candidate) => candidate.id === form.dataset.postId,
    );
    if (!post || !canUseCommentPanel(post)) return;
    const textarea = form.elements.comment;
    const body = cleanText(textarea.value || "");
    if (!body) return;

    const key = getCommentKey(post);
    state.commentsSubmittingByPost.add(key);
    state.commentErrorsByPost.delete(key);
    rerenderActiveModal(post);

    try {
      const response = await fetch("https://padlet.com/api/8/comments", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/vnd.api+json, application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({
          attributes: {
            wish_id: post.commentPostId,
            html_body: `<p>${escapeHtml(body)}</p>`,
            attachment: null,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error("comment-submit-failed");
      const comment = apiCommentToComment(payload.data);
      comment.canEdit = true;
      comment.canDelete = true;
      state.commentsByPost.set(key, [
        ...(state.commentsByPost.get(key) || []),
        comment,
      ]);
    } catch {
      state.commentErrorsByPost.set(
        key,
        "Le commentaire n'a pas pu etre publie.",
      );
    } finally {
      state.commentsSubmittingByPost.delete(key);
      rerenderActiveModal(post);
    }
  }

  async function submitEditComment(form) {
    const commentId = form.dataset.commentId || "";
    const post = state.visiblePosts[state.modalIndex];
    if (!commentId || !post) return;
    const key = getCommentKey(post);
    const comments = state.commentsByPost.get(key) || [];
    const comment = comments.find((candidate) => candidate.id === commentId);
    if (!comment?.canEdit) return;
    const body = cleanText(form.elements.comment.value || "");
    if (!body) return;

    state.commentErrorsByPost.delete(key);
    try {
      const response = await fetch(
        `https://padlet.com/api/8/comments/${encodeURIComponent(commentId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/vnd.api+json, application/json",
            ...getCsrfHeaders(),
          },
          body: JSON.stringify({
            attributes: {
              html_body: `<p>${escapeHtml(body)}</p>`,
            },
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error("comment-edit-failed");
      const updatedComment = {
        ...comment,
        ...apiCommentToComment(payload.data),
        canEdit: comment.canEdit,
        canDelete: comment.canDelete,
      };
      state.commentsByPost.set(
        key,
        comments.map((candidate) =>
          candidate.id === commentId ? updatedComment : candidate,
        ),
      );
      state.commentsEditingById.delete(commentId);
    } catch {
      state.commentErrorsByPost.set(
        key,
        "Le commentaire n'a pas pu etre modifie.",
      );
    } finally {
      rerenderActiveModal(post);
    }
  }

  function startEditComment(commentId) {
    if (!commentId) return;
    state.commentsEditingById.add(commentId);
    renderPostModal();
  }

  function cancelEditComment(commentId) {
    if (!commentId) return;
    state.commentsEditingById.delete(commentId);
    renderPostModal();
  }

  async function deleteModalComment(commentId) {
    const post = state.visiblePosts[state.modalIndex];
    if (!commentId || !post) return;
    const key = getCommentKey(post);
    const comments = state.commentsByPost.get(key) || [];
    const comment = comments.find((candidate) => candidate.id === commentId);
    if (!comment?.canDelete) return;
    if (!confirm("Supprimer ce commentaire?")) return;

    state.commentsDeletingById.add(commentId);
    state.commentErrorsByPost.delete(key);
    rerenderActiveModal(post);
    try {
      const response = await fetch(
        `https://padlet.com/api/5/comments/${encodeURIComponent(commentId)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            Accept: "application/vnd.api+json, application/json",
            ...getCsrfHeaders(),
          },
        },
      );
      if (!response.ok) throw new Error("comment-delete-failed");
      state.commentsByPost.set(
        key,
        comments.filter((candidate) => candidate.id !== commentId),
      );
      state.commentsEditingById.delete(commentId);
    } catch {
      state.commentErrorsByPost.set(
        key,
        "Le commentaire n'a pas pu etre supprime.",
      );
    } finally {
      state.commentsDeletingById.delete(commentId);
      rerenderActiveModal(post);
    }
  }

  function apiCommentToComment(comment) {
    const attributes = comment?.attributes || {};
    const createdAt = attributes.created_at
      ? new Date(attributes.created_at)
      : null;
    return {
      id: String(
        attributes.id || comment?.id || hash(attributes.html_body || ""),
      ),
      author:
        cleanText(attributes.author?.name || attributes.user?.name || "") ||
        cleanText(attributes.author_name || attributes.user_name || ""),
      body: cleanText(
        htmlToText(attributes.html_body || attributes.body || ""),
      ),
      authorHashid: cleanText(
        attributes.author_hashid ||
          attributes.user_hashid ||
          attributes.author?.hashid ||
          attributes.user?.hashid ||
          "",
      ),
      canEdit: canEditComment(attributes),
      canDelete: canDeleteComment(attributes),
      createdAt:
        createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
    };
  }

  function canEditComment(attributes) {
    return Boolean(
      attributes.can_edit ||
      attributes.can_update ||
      attributes.can_manage ||
      attributes.current_user_can_edit ||
      attributes.current_user_can_update ||
      canManageComment(attributes),
    );
  }

  function canDeleteComment(attributes) {
    return Boolean(
      attributes.can_delete ||
      attributes.can_destroy ||
      attributes.can_manage ||
      attributes.current_user_can_delete ||
      attributes.current_user_can_destroy ||
      canManageComment(attributes),
    );
  }

  function canManageComment(attributes) {
    const authorHashid = cleanText(
      attributes.author_hashid ||
        attributes.user_hashid ||
        attributes.author?.hashid ||
        attributes.user?.hashid ||
        "",
    );
    return Boolean(
      state.canModerateComments ||
      (authorHashid && authorHashid === state.currentUserHashid),
    );
  }

  function rerenderActiveModal(post) {
    const activePost = state.visiblePosts[state.modalIndex];
    if (activePost?.id === post.id) renderPostModal();
  }

  function getCommentKey(post) {
    return getCommentWishHashid(post) || post.id;
  }

  function getCommentWishHashid(post) {
    return (
      String(post.commentWishHashid || "") ||
      getCommentWishHashidFromSlug(post.urlSlug) ||
      getCommentWishHashidFromUrl(post.commentUrl)
    );
  }

  function getCommentWishHashidFromSlug(slug) {
    const normalized = normalizeWishSlug(slug || "");
    return normalized ? `post_${normalized}` : "";
  }

  function getCommentWishHashidFromUrl(url) {
    const slug = normalizeWishSlug(
      String(url || "").match(/\/wish\/([^/?#]+)/)?.[1] || "",
    );
    return slug ? `post_${slug}` : "";
  }

  function getCsrfHeaders() {
    const token = document
      .querySelector("meta[name='csrf-token']")
      ?.getAttribute("content");
    return token ? { "X-CSRF-Token": token } : {};
  }

  function getCommentUrl(post) {
    const explicitUrl = normalizePadletCommentUrl(post.commentUrl || "");
    if (explicitUrl) return explicitUrl;
    if (!USE_PADLET_WISH_URLS || !post.urlSlug) return "";
    return normalizePadletCommentUrl(
      `${location.origin}${BOARD_PATH.replace(/\/$/, "")}/wish/${encodeURIComponent(post.urlSlug)}`,
    );
  }

  function renderPdfDescription(post) {
    const body = renderFormattedText(
      getPostBodyText(post, { omitLinkLabels: true }),
      { post, calendar: true },
    );
    return body ? `<div class="epr-pdf-description"><p>${body}</p></div>` : "";
  }

  function renderIcon(name) {
    const paths = {
      "arrow-counterclockwise": [
        "M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z",
        "M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z",
      ],
      "arrow-left": [
        "M15 8a.5.5 0 0 1-.5.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 1 15 8z",
      ],
      "bell-plus": [
        "M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2z",
        "M8 1.918l-.797.161A4.002 4.002 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4.002 4.002 0 0 0-3.203-3.921L8 1.918zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 7.88 3 6a5 5 0 0 1 4-4.9V.5a1 1 0 0 1 2 0v.6A5 5 0 0 1 13 6c0 1.88.32 4.2 1.22 6z",
        "M8.5 4.5a.5.5 0 0 0-1 0V6H6a.5.5 0 0 0 0 1h1.5v1.5a.5.5 0 0 0 1 0V7H10a.5.5 0 0 0 0-1H8.5V4.5z",
      ],
      "arrow-up-circle": [
        "M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1z",
        "M8 4.5a.5.5 0 0 1 .354.146l3 3a.5.5 0 0 1-.708.708L8.5 6.207V11.5a.5.5 0 0 1-1 0V6.207L5.354 8.354a.5.5 0 1 1-.708-.708l3-3A.5.5 0 0 1 8 4.5z",
      ],
      "chevron-left": [
        "M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z",
      ],
      "chevron-right": [
        "M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z",
      ],
      "chevron-down": [
        "M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z",
      ],
      filter: [
        "M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z",
      ],
      "chat-left-text": [
        "M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4.414a2 2 0 0 0-1.414.586l-1.293 1.293A1 1 0 0 1 0 12.172V2a1 1 0 0 1 1-1h13zM1 2v10.172l1.293-1.293A3 3 0 0 1 4.414 10H14V2H1z",
        "M3 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z",
      ],
      download: [
        "M.5 9.9a.5.5 0 0 1 .5.5v2.5A1.1 1.1 0 0 0 2.1 14h11.8a1.1 1.1 0 0 0 1.1-1.1v-2.5a.5.5 0 0 1 1 0v2.5a2.1 2.1 0 0 1-2.1 2.1H2.1A2.1 2.1 0 0 1 0 12.9v-2.5a.5.5 0 0 1 .5-.5z",
        "M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z",
      ],
      "box-arrow-up-right": [
        "M8.636 3.5a.5.5 0 0 0 0 1h2.657L6.146 9.646a.5.5 0 1 0 .708.708L12 5.207v2.657a.5.5 0 0 0 1 0V4a.5.5 0 0 0-.5-.5H8.636z",
        "M2.5 2A1.5 1.5 0 0 0 1 3.5v10A1.5 1.5 0 0 0 2.5 15h10a1.5 1.5 0 0 0 1.5-1.5v-3a.5.5 0 0 0-1 0v3a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h3a.5.5 0 0 0 0-1h-3z",
      ],
      "calendar-plus": [
        "M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v3.5a.5.5 0 0 1-1 0V5H1v8a1 1 0 0 0 1 1h5.5a.5.5 0 0 1 0 1H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4h14V3a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v1z",
        "M12.5 8a.5.5 0 0 1 .5.5V11h2.5a.5.5 0 0 1 0 1H13v2.5a.5.5 0 0 1-1 0V12H9.5a.5.5 0 0 1 0-1H12V8.5a.5.5 0 0 1 .5-.5z",
      ],
      google: [
        "M15.545 6.558a9.42 9.42 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0a7.69 7.69 0 0 1 5.352 2.082l-2.284 2.284A4.35 4.35 0 0 0 8 3.166c-2.087 0-3.86 1.408-4.492 3.304a4.8 4.8 0 0 0 0 3.063h.003c.635 1.893 2.405 3.301 4.492 3.301 1.078 0 2.004-.276 2.722-.764h-.003a3.7 3.7 0 0 0 1.599-2.431H8v-3.08h7.545z",
      ],
      microsoft: [
        "M0 0h7.6v7.6H0V0zm8.4 0H16v7.6H8.4V0zM0 8.4h7.6V16H0V8.4zm8.4 0H16V16H8.4V8.4z",
      ],
      apple: [
        "M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.213-2.188 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.7 3.7 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.853-2.056 2.048-.634 1.195-.826 3.296-.312 4.87.514 1.573 1.304 2.65 1.93 3.396.625.747 1.234 1.263 1.855 1.263.622 0 1.006-.398 2.079-.398 1.072 0 1.331.398 2.113.398.78 0 1.37-.685 1.855-1.219.485-.535.914-1.153 1.196-1.689.282-.535.424-1.092.386-1.188z",
      ],
      "calendar-event": [
        "M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1z",
        "M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z",
      ],
      "x-lg": [
        "M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z",
      ],
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
    if (!omitLinkLabels) return cleanPostBodyText(text);

    const labels = getDisplayLinks(post)
      .flatMap((link) => [link.label, `PDF - ${link.label}`])
      .map((label) => cleanText(label || ""))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    const lines = getVisibleBodyLines(text);
    return cleanPostBodyText(
      repairPadletTextSpacing(
        cleanText(lines.filter((line) => !labels.includes(line)).join("\n")),
      ),
    );
  }

  function cleanPostBodyText(text) {
    const body = cleanText(getVisibleBodyLines(text).join("\n"));
    return isEmptyBodyPlaceholder(body) ? "" : body;
  }

  function getVisibleBodyLines(text) {
    return cleanText(text)
      .split("\n")
      .map((line) => cleanText(line))
      .filter((line) => line && !isEmptyBodyPlaceholder(line));
  }

  function isEmptyBodyPlaceholder(text) {
    return ["vide", "empty"].includes(normalizePlaceholderText(text));
  }

  function chooseMeaningfulText(...values) {
    const candidate = values
      .map((value) => cleanText(htmlToText(value || "")))
      .find((value) => value && !isEmptyBodyPlaceholder(value));
    return candidate || "Communication";
  }

  function normalizePlaceholderText(text) {
    return removeAccents(
      cleanText(String(text || ""))
        .replace(/[\u200b-\u200d\ufeff]/g, "")
        .toLowerCase(),
    ).replace(/\s+/g, " ");
  }

  function renderFormattedText(text, options = {}) {
    const normalized = normalizeSentenceSpacing(text).replace(/\n{2,}/g, "\n");
    if (options.calendar && options.post) {
      return renderCalendarText(normalized, options.post);
    }
    return renderAutoLinkedText(normalized).replace(/\n/g, "<br>");
  }

  function renderCalendarText(text, post) {
    return String(text || "")
      .split("\n")
      .map((line) => renderCalendarLine(line, post))
      .join("<br>");
  }

  function renderCalendarLine(line, post) {
    const events = extractCalendarEventsFromLine(line, post);
    if (!events.length) return renderAutoLinkedText(line);

    let result = "";
    let cursor = 0;
    for (const event of events) {
      if (event.startIndex < cursor) continue;
      result += renderAutoLinkedText(line.slice(cursor, event.startIndex));
      result += renderCalendarEvent(event);
      cursor = event.endIndex;
    }
    return result + renderAutoLinkedText(line.slice(cursor));
  }

  function extractCalendarEventsFromLine(line, post) {
    const source = String(line || "");
    if (!shouldSuggestCalendarEvent(source)) return [];

    const events = [];
    const normalized = removeAccents(source.toLowerCase());
    const monthNames =
      "janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec";
    const weekdayNames = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche";
    const alternativePattern = new RegExp(
      `(?:${weekdayNames})\\s+ou\\s+(?:${weekdayNames})\\s+(\\d{1,2})(?:er)?\\s+ou\\s+(\\d{1,2})(?:er)?\\s+(${monthNames})(?:\\s+(20\\d{2}))?`,
      "gi",
    );
    const datePattern = new RegExp(
      `(?:(?:${weekdayNames})\\s+(?:le\\s+)?)?(\\d{1,2})(?:er)?\\s+(${monthNames})(?:\\s+(20\\d{2}))?`,
      "gi",
    );

    for (const match of normalized.matchAll(alternativePattern)) {
      const month = MONTHS.get(match[3]);
      const year = match[4] ? Number(match[4]) : inferCalendarYear(month);
      const range = getCalendarDateTextRange(source, normalized, match);
      [Number(match[1]), Number(match[2])].forEach((day) => {
        const date = buildValidCalendarDate(year, month, day);
        if (!date) return;
        events.push(
          buildCalendarEvent({
            line: source,
            post,
            date,
            dateText: source.slice(range.startIndex, range.dateEndIndex),
            separatorText: range.separatorText,
            startIndex: range.startIndex,
            endIndex: range.endIndex,
          }),
        );
      });
    }

    if (events.length) return dedupeCalendarEvents(events);

    for (const match of normalized.matchAll(datePattern)) {
      const month = MONTHS.get(match[2]);
      const year = match[3] ? Number(match[3]) : inferCalendarYear(month);
      const date = buildValidCalendarDate(year, month, Number(match[1]));
      if (!date) continue;
      const range = getCalendarDateTextRange(source, normalized, match);
      events.push(
        buildCalendarEvent({
          line: source,
          post,
          date,
          dateText: source.slice(range.startIndex, range.dateEndIndex),
          separatorText: range.separatorText,
          startIndex: range.startIndex,
          endIndex: range.endIndex,
        }),
      );
    }

    return dedupeCalendarEvents(events);
  }

  function getCalendarDateTextRange(source, normalized, match) {
    const prefix = normalized
      .slice(0, match.index)
      .match(
        /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(?:le\s+)?$/,
      );
    const startIndex = prefix ? match.index - prefix[0].length : match.index;
    const dateEndIndex = match.index + match[0].length;
    const separator = source.slice(dateEndIndex).match(/^\s*:/)?.[0] || "";
    return {
      startIndex,
      dateEndIndex,
      endIndex: dateEndIndex + separator.length,
      separatorText: separator,
      text: source.slice(startIndex, dateEndIndex),
    };
  }
  function shouldSuggestCalendarEvent(line) {
    const normalized = removeAccents(line.toLowerCase());
    if (
      /\b(?:pv|proces-verbal|proces verbal|ordre du jour)\b/.test(normalized)
    ) {
      return /\b(?:rencontre|se rencontrera|aura lieu|se tiendra|invitation|fete|sortie|photo|journee|agenda|date limite|avant le)\b/.test(
        normalized,
      );
    }
    return !/\b(?:projet educatif|5-10 minutes)\b/.test(normalized);
  }

  function buildCalendarEvent({
    line,
    post,
    date,
    dateText,
    separatorText = "",
    startIndex,
    endIndex,
  }) {
    const timeRange = extractCalendarTimeRange(line);
    const start = timeRange
      ? setCalendarTime(date, timeRange.startHour, timeRange.startMinute)
      : date;
    const end =
      timeRange?.endHour != null
        ? setCalendarTime(date, timeRange.endHour, timeRange.endMinute)
        : timeRange
          ? new Date(start.getTime() + 60 * 60 * 1000)
          : null;
    const title = cleanText(post.title || line || "Evenement Padlet");
    const url = getCommentUrl(post) || location.href;
    const description = cleanText(`${line}\n\nCommunication Padlet: ${url}`);
    return {
      id: hash(`${post.id}|${dateText}|${start.toISOString()}|${line}`),
      title,
      description,
      location: "",
      allDay: !timeRange,
      start,
      end,
      dateText,
      separatorText,
      startIndex,
      endIndex,
    };
  }

  function extractCalendarTimeRange(line) {
    const normalized = removeAccents(String(line || "").toLowerCase());
    const match = normalized.match(
      /\b(?:a|à|de|entre|vers)?\s*(\d{1,2})h(?:(\d{2}))?\s*(?:-|a|à|et)?\s*(?:(\d{1,2})h(?:(\d{2}))?)?/,
    );
    if (!match) return null;
    return {
      startHour: Number(match[1]),
      startMinute: Number(match[2] || 0),
      endHour: match[3] == null ? null : Number(match[3]),
      endMinute: match[3] == null ? null : Number(match[4] || 0),
    };
  }

  function setCalendarTime(date, hour, minute) {
    const result = new Date(date);
    result.setHours(hour, minute, 0, 0);
    return result;
  }

  function buildValidCalendarDate(year, month, day) {
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day)
    ) {
      return null;
    }
    const date = new Date(year, month, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day
    ) {
      return null;
    }
    return startOfDay(date);
  }

  function inferCalendarYear(month) {
    const match = BOARD_PATH.match(/(20\d{2})-(20\d{2})/);
    if (match) return month >= 7 ? Number(match[1]) : Number(match[2]);
    return normalizeYear(null, month);
  }

  function dedupeCalendarEvents(events) {
    const seen = new Set();
    return events.filter((event) => {
      const key = `${event.startIndex}|${event.endIndex}|${event.start.toISOString()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderCalendarEvent(event) {
    return [
      `<span class="epr-calendar-event">`,
      `<span class="epr-calendar-date-text">${escapeHtml(event.dateText)}</span>`,
      event.separatorText
        ? `<span class="epr-calendar-separator">${escapeHtml(event.separatorText)}</span>`
        : "",
      `<button type="button" class="epr-calendar-trigger" data-action="toggle-calendar-menu" aria-expanded="false" aria-label="Ajouter ${escapeHtml(event.dateText)} a l'agenda" title="Ajouter a l'agenda">`,
      renderIcon("calendar-plus"),
      `</button>`,
      `<span class="epr-calendar-menu" role="menu" aria-label="Ajouter a l'agenda" hidden>`,
      renderCalendarMenuItem(
        "Google Calendar",
        "google",
        buildGoogleCalendarUrl(event),
        { external: true },
      ),
      renderCalendarMenuItem(
        "Outlook",
        "microsoft",
        buildOutlookCalendarUrl(event),
        { external: true },
      ),
      renderCalendarMenuItem(
        "Apple Calendar",
        "apple",
        buildIcsDataUrl(event),
        {
          download: buildIcsFileName(event),
        },
      ),
      renderCalendarMenuItem(
        "Fichier .ics",
        "calendar-event",
        buildIcsDataUrl(event),
        { download: buildIcsFileName(event) },
      ),
      `</span>`,
      `</span>`,
    ].join("");
  }

  function renderCalendarMenuItem(label, icon, href, options = {}) {
    const target = options.external
      ? ' target="_blank" rel="noopener noreferrer"'
      : "";
    const download = options.download
      ? ` download="${escapeHtml(options.download)}"`
      : "";
    return `<a role="menuitem" href="${escapeHtml(href)}"${target}${download}>${renderIcon(icon)}<span>${escapeHtml(label)}</span></a>`;
  }
  function buildGoogleCalendarUrl(event) {
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      details: event.description,
    });
    if (event.location) params.set("location", event.location);
    params.set("dates", formatCalendarDateRange(event, "google"));
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function buildOutlookCalendarUrl(event) {
    const params = new URLSearchParams({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: event.title,
      body: event.description,
      startdt: event.allDay
        ? formatDateOnly(event.start)
        : event.start.toISOString(),
    });
    if (event.end) {
      params.set(
        "enddt",
        event.allDay
          ? formatDateOnly(addDays(event.start, 1))
          : event.end.toISOString(),
      );
    }
    if (event.location) params.set("location", event.location);
    return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  function buildIcsDataUrl(event) {
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcsContent(event))}`;
  }

  function buildIcsContent(event) {
    const uid = `${event.id}@uglypadlet.carnould.com`;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//UglyPadlet//Calendar//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(uid)}`,
      `DTSTAMP:${formatIcsDateTime(new Date())}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
    ];
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.start)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(addDays(event.start, 1))}`);
    } else {
      lines.push(`DTSTART:${formatIcsDateTime(event.start)}`);
      lines.push(
        `DTEND:${formatIcsDateTime(event.end || new Date(event.start.getTime() + 60 * 60 * 1000))}`,
      );
    }
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  }

  function formatCalendarDateRange(event) {
    if (event.allDay) {
      return `${formatDateOnly(event.start)}/${formatDateOnly(addDays(event.start, 1))}`;
    }
    return `${formatGoogleDateTime(event.start)}/${formatGoogleDateTime(event.end || new Date(event.start.getTime() + 60 * 60 * 1000))}`;
  }

  function formatGoogleDateTime(date) {
    return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
  }

  function formatIcsDateTime(date) {
    return formatGoogleDateTime(date);
  }

  function formatDateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function escapeIcsText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function buildIcsFileName(event) {
    return `${slugifyFileName(event.title)}-${formatDateOnly(event.start)}.ics`;
  }

  function slugifyFileName(value) {
    const slug = removeAccents(String(value || "evenement"))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return slug || "evenement-padlet";
  }
  function renderAutoLinkedText(text) {
    const source = String(text || "");
    const linkPattern = createInlineLinkPattern();
    let result = "";
    let cursor = 0;
    let match;

    while ((match = linkPattern.exec(source))) {
      const rawMatch = match[0];
      const start = match.index;
      const { url, suffix } = splitTrailingUrlPunctuation(rawMatch);
      const href = isEmailAddress(url)
        ? `mailto:${url}`
        : url.startsWith("www.")
          ? `https://${url}`
          : url;
      const target = href.startsWith("mailto:")
        ? ""
        : ' target="_blank" rel="noopener noreferrer"';

      result += escapeHtml(source.slice(cursor, start));
      result += `<a href="${escapeHtml(href)}"${target}>${escapeHtml(url)}</a>${escapeHtml(suffix)}`;
      cursor = start + rawMatch.length;
    }

    return result + escapeHtml(source.slice(cursor));
  }

  function createInlineLinkPattern() {
    return /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  }

  function isEmailAddress(value) {
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value || ""));
  }

  function splitTrailingUrlPunctuation(value) {
    let url = String(value || "");
    let suffix = "";
    while (
      /[.,!?;:]$/.test(url) ||
      (url.endsWith(")") && !hasBalancedParentheses(url))
    ) {
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
    const linkPattern = createInlineLinkPattern();
    let result = "";
    let cursor = 0;
    let match;

    while ((match = linkPattern.exec(source))) {
      result += source
        .slice(cursor, match.index)
        .replace(/([.!?])(?=\S)/g, (mark) => `${mark} `);
      result += match[0];
      cursor = match.index + match[0].length;
    }

    result += source
      .slice(cursor)
      .replace(/([.!?])(?=\S)/g, (mark) => `${mark} `);
    return repairPadletTextSpacing(result);
  }

  function repairPadletTextSpacing(text) {
    return String(text || "").replace(/MEQ\.Un/g, "MEQ. Un");
  }

  function renderNewBadge(post) {
    return isNewPost(post)
      ? '<span class="epr-new-badge" aria-label="Nouvelle publication"></span>'
      : "";
  }

  function isNewPost(post) {
    if (!state.previousConnectionDate) return false;
    const postDate = post.publishedAt || post.date;
    if (!postDate) return false;
    return startOfDay(postDate) >= startOfDay(state.previousConnectionDate);
  }

  function renderSectionBadge(section) {
    const colors = getSectionBadgeColors(section);
    return `<span class="epr-section-badge" style="--epr-section-bg: ${colors.background}; --epr-section-fg: ${colors.foreground}; --epr-section-border: ${colors.border};">${escapeHtml(section)}</span>`;
  }

  function getSectionBadgeColors(section) {
    const seedText =
      removeAccents(
        cleanText(String(section || "Non classee")).toLowerCase(),
      ) || "non-classee";
    const seed = unsignedHash(seedText);
    const hue = seed % 360;
    const saturation = 52 + ((seed >>> 8) % 22);
    const preferredLightness = 38 + ((seed >>> 16) % 38);
    const textCandidates = [
      { color: "#17242b", rgb: [23, 36, 43] },
      { color: "#ffffff", rgb: [255, 255, 255] },
    ];
    const lightnessCandidates = [
      preferredLightness,
      Math.min(84, preferredLightness + 18),
      Math.max(30, preferredLightness - 18),
      82,
      32,
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
            border: rgbToHex(
              hslToRgb(hue, saturation, Math.max(22, lightness - 14)),
            ),
          };
        }
      }
    }

    return {
      background: rgbToHex(best.rgb),
      foreground: best.foreground,
      border: rgbToHex(
        hslToRgb(hue, saturation, Math.max(22, best.lightness - 14)),
      ),
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
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
      hue < 60
        ? [c, x, 0]
        : hue < 120
          ? [x, c, 0]
          : hue < 180
            ? [0, c, x]
            : hue < 240
              ? [0, x, c]
              : hue < 300
                ? [x, 0, c]
                : [c, 0, x];
    return [r, g, b].map((channel) => Math.round((channel + m) * 255));
  }

  function rgbToHex(rgb) {
    return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  function contrastRatio(first, second) {
    const lighter = Math.max(
      relativeLuminance(first),
      relativeLuminance(second),
    );
    const darker = Math.min(
      relativeLuminance(first),
      relativeLuminance(second),
    );
    return (lighter + 0.05) / (darker + 0.05);
  }

  function relativeLuminance(rgb) {
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function renderImageGallery(post) {
    if (!post.images.length) return "";
    if (post.images.length === 1) {
      return `<div class="epr-images"><img src="${escapeHtml(post.images[0])}" alt="" loading="lazy"></div>`;
    }

    const activeIndex = Math.min(state.modalImageIndex, post.images.length - 1);
    const dots = post.images
      .map((_, index) => {
        return `<span class="${index === activeIndex ? "epr-gallery-dot epr-gallery-dot-active" : "epr-gallery-dot"}"></span>`;
      })
      .join("");

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
    const text = cleanText(
      link.innerText ||
        link.textContent ||
        link.getAttribute("aria-label") ||
        "",
    );
    return {
      href,
      label: limit(text || readableUrlLabel(href), 90),
      isPdf: isPdfHref(href) || /(^|\W)pdf(\W|$)/i.test(text),
    };
  }

  function getDisplayLinks(post) {
    const isPdfPost = isLikelyPdfPost(post);
    return post.links.map((link, index) => {
      const shouldUpgradePdf = isPdfPost && index === 0 && !link.isPdf;
      const label =
        shouldUpgradePdf || isOpaqueLinkLabel(link.label)
          ? post.title
          : link.label;
      return {
        ...link,
        label: limit(label, 90),
        isPdf: Boolean(link.isPdf) || shouldUpgradePdf,
      };
    });
  }

  function normalizeCachedLink(link) {
    if (typeof link === "string") {
      return {
        href: link,
        label: readableUrlLabel(link),
        isPdf: isPdfHref(link),
      };
    }
    if (!link || typeof link.href !== "string") return null;
    return {
      href: link.href,
      label: limit(link.label || readableUrlLabel(link.href), 90),
      isPdf: Boolean(link.isPdf) || isPdfHref(link.href),
    };
  }

  function renderLinks(links) {
    return links
      .map((link) => {
        const label = link.isPdf ? `PDF - ${link.label}` : link.label;
        const icon = isDownloadLink(link) ? "download" : "box-arrow-up-right";
        return `<a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${renderIcon(icon)}<span>${escapeHtml(label)}</span></a>`;
      })
      .join("");
  }

  function renderVideoViewer(link, options = {}) {
    const embedUrl = getVideoEmbedUrl(link.href);
    if (!embedUrl) return "";
    const compactClass = options.compact ? " epr-youtube-viewer-compact" : "";
    return `
      <section class="epr-video-viewer epr-youtube-viewer${compactClass}" aria-label="Video integree">
        <iframe
          src="${escapeHtml(embedUrl)}"
          title="${escapeHtml(link.label || "Video")}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
      </section>
    `;
  }

  function renderYouTubeViewer(link, options = {}) {
    return renderVideoViewer(link, options);
  }

  function renderPdfViewer(link) {
    return `
      <section class="epr-pdf-viewer" aria-label="Apercu PDF">
        ${renderPdfFrame(link)}
        <p><a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${renderIcon("download")}<span>Ouvrir le PDF dans un nouvel onglet</span></a></p>
      </section>
    `;
  }

  function renderPdfFrame(link) {
    const initialSrc = isPdfHref(link.href)
      ? withPdfViewerOptions(link.href)
      : "about:blank";
    return `<iframe src="${escapeHtml(initialSrc)}" data-pdf-source="${escapeHtml(link.href)}" title="${escapeHtml(link.label)}"></iframe>`;
  }

  function isYouTubeLink(link) {
    return Boolean(getYouTubeVideoId(link?.href));
  }

  function isVimeoLink(link) {
    return Boolean(getVimeoVideoData(link?.href));
  }

  function isEmbeddedVideoLink(link) {
    return isYouTubeLink(link) || isVimeoLink(link);
  }

  function getVideoEmbedUrl(href) {
    return getYouTubeEmbedUrl(href) || getVimeoEmbedUrl(href);
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
      if (host === "youtu.be")
        return normalizeYouTubeId(url.pathname.split("/").filter(Boolean)[0]);
      if (
        ![
          "youtube.com",
          "m.youtube.com",
          "music.youtube.com",
          "youtube-nocookie.com",
        ].includes(host)
      )
        return "";
      if (url.pathname.startsWith("/watch"))
        return normalizeYouTubeId(url.searchParams.get("v"));
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live", "v"].includes(parts[0]))
        return normalizeYouTubeId(parts[1]);
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
      return parseYouTubeTime(
        url.searchParams.get("start") || url.searchParams.get("t") || "",
      );
    } catch {
      return 0;
    }
  }

  function parseYouTubeTime(value) {
    const raw = String(value || "")
      .trim()
      .toLowerCase();
    if (/^\d+$/.test(raw)) return Number(raw);
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (!match) return 0;
    return (
      Number(match[1] || 0) * 3600 +
      Number(match[2] || 0) * 60 +
      Number(match[3] || 0)
    );
  }

  function getVimeoEmbedUrl(href) {
    const video = getVimeoVideoData(href);
    if (!video) return "";
    const url = new URL(`https://player.vimeo.com/video/${video.id}`);
    if (video.hash) url.searchParams.set("h", video.hash);
    url.searchParams.set("title", "0");
    url.searchParams.set("byline", "0");
    url.searchParams.set("portrait", "0");
    return url.href;
  }

  function getVimeoVideoData(href) {
    try {
      const url = new URL(absolutizeUrl(href));
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      const parts = url.pathname.split("/").filter(Boolean);
      let id = "";
      let hash = url.searchParams.get("h") || "";

      if (host === "player.vimeo.com" && parts[0] === "video") {
        id = parts[1] || "";
      } else if (["vimeo.com", "m.vimeo.com"].includes(host)) {
        const index = parts.findIndex((part) => /^\d{6,14}$/.test(part));
        if (index >= 0) {
          id = parts[index];
          hash =
            hash ||
            (/^[a-z0-9]+$/i.test(parts[index + 1] || "")
              ? parts[index + 1]
              : "");
        }
      }

      if (!/^\d{6,14}$/.test(id)) return null;
      return {
        id,
        hash: /^[a-z0-9]+$/i.test(hash) ? hash : "",
      };
    } catch {
      return null;
    }
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
      if (document.contains(visibleFrame))
        setPdfFrameSource(visibleFrame, finalUrl);
    };

    const tryResolve = () => {
      attempts += 1;
      const resolvedUrl = findPdfUrlInFrame(resolver, source);
      if (resolvedUrl || attempts >= 24) finish(resolvedUrl);
    };

    resolver.addEventListener("load", tryResolve);
    timer = setInterval(tryResolve, 250);
    resolvePdfUrlFromFetch(source)
      .then((resolvedUrl) => {
        if (resolvedUrl) finish(resolvedUrl);
      })
      .catch(() => {});
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
      ...Array.from(
        doc.querySelectorAll("embed[src], iframe[src], object[data], a[href]"),
      ).map((node) => {
        return (
          node.getAttribute("src") ||
          node.getAttribute("data") ||
          node.getAttribute("href") ||
          ""
        );
      }),
      ...extractPdfUrlsFromText(doc.documentElement?.innerHTML || ""),
    ]
      .map((href) => absolutizeUrl(href, originalUrl))
      .filter(Boolean);

    return (
      candidates.find((href) => isPdfHref(href)) ||
      candidates.find(
        (href) => /\/pdf|pdf\/|\.pdf|blob:/i.test(href) && href !== originalUrl,
      ) ||
      ""
    );
  }

  async function resolvePdfUrlFromFetch(source) {
    const response = await fetch(source, { credentials: "include" });
    if (!response.ok) return "";
    const text = await response.text();
    return (
      extractPdfUrlsFromText(text)
        .map((href) => absolutizeUrl(href, source))
        .find(Boolean) || ""
    );
  }

  function extractPdfUrlsFromText(text) {
    return Array.from(
      String(text).matchAll(
        /https?:\\?\/\\?\/[^"'<>\\\s]+?\.pdf(?:\?[^"'<>\\\s]*)?/gi,
      ),
    ).map((match) => match[0].replaceAll("\\/", "/"));
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

  function isDownloadLink(link) {
    return isPdfLink(link) || isDownloadHref(link?.href || "");
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
      return (
        /\.pdf$/i.test(url.pathname) ||
        /(?:^|[?&])(type|format|filetype)=pdf(?:&|$)/i.test(url.search)
      );
    } catch {
      return /\.pdf(?:$|[?#])/i.test(href);
    }
  }

  function isDownloadHref(href) {
    try {
      const url = new URL(href, location.href);
      return /\.(?:docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|txt|zip|rar|7z|png|jpe?g|gif|webp|heic|heif)$/i.test(
        url.pathname,
      );
    } catch {
      return /\.(?:docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|txt|zip|rar|7z|png|jpe?g|gif|webp|heic|heif)(?:$|[?#])/i.test(
        String(href || ""),
      );
    }
  }

  function isImageHref(href) {
    try {
      const url = new URL(href, location.href);
      return /\.(?:png|jpe?g|gif|webp|heic|heif)$/i.test(url.pathname);
    } catch {
      return /\.(?:png|jpe?g|gif|webp|heic|heif)(?:$|[?#])/i.test(
        String(href || ""),
      );
    }
  }

  function mediaDeduplicationKey(href) {
    try {
      const url = new URL(href, location.href);
      const parts = url.pathname.split("/").filter(Boolean);
      return parts.slice(-2).join("/").toLowerCase() || url.pathname;
    } catch {
      return String(href || "").toLowerCase();
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
      const lastPart = decodeURIComponent(
        url.pathname.split("/").filter(Boolean).pop() || url.hostname,
      );
      return (
        lastPart.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_]+/g, " ") ||
        url.hostname
      );
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
    if (event.key === "Escape" && root.querySelector(".epr-calendar-open")) {
      event.preventDefault();
      closeCalendarMenus();
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
    return text.startsWith(title) ? text.slice(title.length).trim() : text;
  }

  function isPadletUiChrome(text) {
    const normalized = removeAccents(text.toLowerCase());
    return [
      "appuyez sur echap pour quitter cette fenetre",
      "volet de discussion avec l'ia",
      "aller au contenu",
      "inscrivez-vous sur padlet",
      "vous n'avez pas l'autorisation necessaire",
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
    const descendants = [
      ...node.querySelectorAll(
        "article, [role='article'], [data-testid*='post' i], [data-test-id*='post' i], [class*='post' i]",
      ),
    ]
      .filter(
        (child) =>
          child !== node &&
          child instanceof HTMLElement &&
          !root.contains(child) &&
          isVisible(child),
      )
      .map((child) =>
        compactForCompare(child.innerText || child.textContent || ""),
      )
      .filter((text) => text.length >= 24);
    if (descendants.length < 2) return false;

    const uniqueDescendants = descendants.filter(
      (text, index, arr) =>
        arr.findIndex(
          (other) =>
            other === text || other.includes(text) || text.includes(other),
        ) === index,
    );
    return uniqueDescendants.length >= 2;
  }

  function hasDate(text) {
    const normalized = removeAccents(text.toLowerCase());
    return (
      /\b20\d{2}-\d{1,2}-\d{1,2}\b/.test(normalized) ||
      /\b\d{1,2}[\/.-]\d{1,2}/.test(normalized) ||
      /\b\d{1,2}(?:er)?\s+(janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\b/.test(
        normalized,
      )
    );
  }

  function isDateOnlyLine(line) {
    return /^\s*(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s*$/.test(
      removeAccents(line.toLowerCase()),
    );
  }

  function isVisible(node) {
    const style = getComputedStyle(node);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0
    );
  }

  function cleanText(text) {
    return text
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function compactForCompare(text) {
    return removeAccents(cleanText(text).toLowerCase()).replace(/\s+/g, " ");
  }

  function normalizeSection(section) {
    const normalized = section.toUpperCase();
    if (
      ["TPS", "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2"].includes(
        normalized,
      )
    )
      return normalized;
    return section;
  }

  function removeAccents(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function initializeConnectionDate() {
    const lastConnectionDate = readStoredDate(CONNECTION_DATE_KEY);
    const currentConnectionDate = readStoredDate(CURRENT_CONNECTION_DATE_KEY);

    if (!currentConnectionDate) {
      localStorage.setItem(CURRENT_CONNECTION_DATE_KEY, TODAY.toISOString());
      return lastConnectionDate;
    }

    if (!sameDay(currentConnectionDate, TODAY)) {
      localStorage.setItem(
        CONNECTION_DATE_KEY,
        currentConnectionDate.toISOString(),
      );
      localStorage.setItem(CURRENT_CONNECTION_DATE_KEY, TODAY.toISOString());
      return currentConnectionDate;
    }

    return lastConnectionDate;
  }

  function readStoredDate(key) {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const date = new Date(stored);
    return Number.isNaN(date.getTime()) ? null : startOfDay(date);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
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
        if (!otherText.includes(text) || otherText.length < text.length * 1.25)
          return false;
        return (
          hasRelatedTitle(post, other) ||
          sameDateKey(post, other) ||
          isLowInformationPost(post)
        );
      });
    });
  }

  function hasRelatedTitle(post, other) {
    const title = compactForCompare(post.title);
    const otherTitle = compactForCompare(other.title);
    return (
      title.length >= 8 &&
      (otherTitle.includes(title) || title.includes(otherTitle))
    );
  }

  function sameDateKey(post, other) {
    return post.dateKey && post.dateKey === other.dateKey;
  }

  function isLowInformationPost(post) {
    const text = compactForCompare(post.text);
    return (
      text.length < 220 ||
      /\b(pdf|forms\.cloud\.microsoft|microsoft forms)\b/i.test(text)
    );
  }

  function hash(value) {
    let result = 0;
    for (let index = 0; index < value.length; index += 1) {
      result = (Math.imul(31, result) + value.charCodeAt(index)) | 0;
    }
    return String(result);
  }

  function limit(value, max) {
    return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
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
