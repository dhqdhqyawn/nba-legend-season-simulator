(() => {
  "use strict";

  const scriptDataset = document.currentScript?.dataset || {};
  const configuration = Object.freeze({
    endpoint: "/api/analytics/events",
    environment: scriptDataset.analyticsEnvironment || "candidate",
    releaseVersion: scriptDataset.analyticsRelease || "product-monitoring-1.1.0-local-candidate",
    ...(globalThis.__PRODUCT_ANALYTICS_CONFIG__ || {}),
  });
  const VISITOR_KEY = "nba82ProductAnalyticsVisitorV1";
  const SESSION_KEY = "nba82ProductAnalyticsSessionV1";
  const MAX_BUFFER = 40;
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  const buffered = [];
  const oncePerSession = new Set();
  let flushTimer = null;
  let sending = false;
  let nba82Started = false;
  let nba5Started = false;
  let nba5StartedMode = "nba5";
  let nba5StartResultSignature = "";
  let lastPackSignature = "";
  let lastObservedMode = "home";

  function randomId(prefix) {
    const value = globalThis.crypto?.randomUUID?.()
      || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${value.replace(/[^A-Za-z0-9_-]/g, "")}`;
  }

  function storedId(storage, key, prefix) {
    try {
      const current = storage?.getItem(key);
      if (/^[A-Za-z0-9_-]{16,80}$/.test(current || "")) return current;
      const created = randomId(prefix);
      storage?.setItem(key, created);
      return created;
    } catch {
      return randomId(prefix);
    }
  }

  const visitorId = storedId(globalThis.localStorage, VISITOR_KEY, "visitor");
  const sessionId = storedId(globalThis.sessionStorage, SESSION_KEY, "session");

  function language() {
    return document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
  }

  function deviceClass() {
    const width = Math.max(document.documentElement.clientWidth || 0, globalThis.innerWidth || 0);
    if (width < 600) return "mobile";
    if (width < 960) return "tablet";
    return "desktop";
  }

  function entrySource() {
    if (!document.referrer) return "direct";
    try {
      return new URL(document.referrer).origin === location.origin ? "internal" : "external";
    } catch {
      return "external";
    }
  }

  function currentMode() {
    if (document.body.classList.contains("game-mode-battle")) {
      return document.body.classList.contains("battle-channel-online") ? "online" : "nba5";
    }
    if (document.body.classList.contains("game-mode-solo")) return "nba82";
    return "home";
  }

  function eventRecord(name, mode = currentMode()) {
    return {
      id: randomId("event"),
      name,
      occurredAt: Date.now(),
      environment: configuration.environment,
      mode,
      language: language(),
      deviceClass: deviceClass(),
      entrySource: entrySource(),
      releaseVersion: configuration.releaseVersion,
    };
  }

  function scheduleFlush(delay = 600) {
    if (flushTimer !== null) return;
    flushTimer = globalThis.setTimeout(() => {
      flushTimer = null;
      void flush();
    }, delay);
  }

  function emit(name, mode, { once = false } = {}) {
    const onceKey = `${name}:${mode || currentMode()}`;
    if (once && oncePerSession.has(onceKey)) return false;
    if (once) oncePerSession.add(onceKey);
    buffered.push(eventRecord(name, mode));
    if (buffered.length > MAX_BUFFER) buffered.splice(0, buffered.length - MAX_BUFFER);
    scheduleFlush();
    return true;
  }

  async function flush() {
    if (sending || !nativeFetch || buffered.length === 0) return;
    sending = true;
    const events = buffered.splice(0, 20);
    try {
      await nativeFetch(configuration.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          sessionId,
          environment: configuration.environment,
          mode: currentMode(),
          language: language(),
          deviceClass: deviceClass(),
          entrySource: entrySource(),
          releaseVersion: configuration.releaseVersion,
          events,
        }),
        credentials: "same-origin",
        keepalive: true,
      });
    } catch {
      // Analytics is deliberately best-effort and must never interrupt the game.
    } finally {
      sending = false;
      if (buffered.length) scheduleFlush(800);
    }
  }

  function markLineupComplete() {
    const selectInfo = document.getElementById("selectInfo")?.textContent || "";
    const simulationReady = ["simulateBtn", "simulateBtnInline"]
      .some((id) => document.getElementById(id)?.disabled === false);
    if (/5\s*\/\s*5/.test(selectInfo) || simulationReady) {
      emit("lineup_completed", currentMode(), { once: true });
    }
  }

  function markPackOpened() {
    const cards = document.getElementById("cards");
    if (!cards || cards.children.length < 1) return;
    const signature = `${cards.children.length}:${(cards.textContent || "").slice(0, 180)}`;
    if (!signature || signature === lastPackSignature) return;
    lastPackSignature = signature;
    emit("pack_opened", currentMode(), { once: true });
  }

  function markModeEntered() {
    const mode = currentMode();
    if (mode === lastObservedMode) return;
    lastObservedMode = mode;
    if (mode !== "home") emit("mode_entered", mode);
  }

  function markNba82Complete() {
    if (!nba82Started) return;
    const record = document.getElementById("record")?.textContent || "";
    const modal = document.getElementById("seasonModal");
    if (/\d+\s*-\s*\d+/.test(record) && modal?.classList.contains("is-open")) {
      nba82Started = false;
      emit("nba82_completed", "nba82");
    }
  }

  function nba5ResultSignature() {
    const result = document.getElementById("battleResult")?.textContent || "";
    const modalResult = document.getElementById("battleResultModalContent")?.textContent || "";
    return `${result.trim()}|${modalResult.trim()}`;
  }

  function markNba5Started(mode = currentMode() === "online" ? "online" : "nba5") {
    if (nba5Started) return false;
    nba5Started = true;
    nba5StartedMode = mode;
    nba5StartResultSignature = nba5ResultSignature();
    emit("nba5_started", mode);
    return true;
  }

  function markNba5Complete(mode = nba5StartedMode) {
    if (!nba5Started) return;
    const section = document.getElementById("battleResultsSection");
    const modal = document.getElementById("battleResultModal");
    const signature = nba5ResultSignature();
    const resultVisible = (section && !section.hidden) || (modal && !modal.hidden);
    if (resultVisible && signature.length > 20 && signature !== nba5StartResultSignature) {
      nba5Started = false;
      nba5StartResultSignature = signature;
      emit("nba5_completed", mode);
    }
  }

  function completedCoachSeries(payload) {
    const candidates = [payload, payload?.snapshot, payload?.state, payload?.room];
    return candidates.some((candidate) => (
      candidate?.phase === "series_complete"
      || candidate?.status === "series_complete"
      || candidate?.series?.status === "complete"
    ));
  }

  function markShareComplete() {
    const panel = document.getElementById("sharePanel");
    const image = document.getElementById("shareImage");
    if (panel && !panel.hidden && image?.getAttribute("src")) {
      emit("result_shared", currentMode(), { once: true });
    }
  }

  function observeElement(id, callback, options = { childList: true, subtree: true, attributes: true }) {
    const element = document.getElementById(id);
    if (!element) return;
    new MutationObserver(() => queueMicrotask(callback)).observe(element, options);
  }

  function installGameObservers() {
    observeElement("cards", markPackOpened);
    observeElement("selectInfo", markLineupComplete, { childList: true, subtree: true, characterData: true });
    observeElement("lineup", markLineupComplete);
    observeElement("record", markNba82Complete, { childList: true, subtree: true, characterData: true });
    observeElement("seasonModal", markNba82Complete, { attributes: true, attributeFilter: ["class"] });
    observeElement("battleResultsSection", markNba5Complete);
    observeElement("battleResult", markNba5Complete);
    observeElement("battleResultModal", markNba5Complete, { attributes: true, attributeFilter: ["hidden"] });
    observeElement("battleResultModalContent", markNba5Complete);
    observeElement("sharePanel", markShareComplete);
    observeElement("shareImage", markShareComplete, { attributes: true, attributeFilter: ["src"] });
    new MutationObserver(() => queueMicrotask(markModeEntered)).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (!button || button.disabled) return;
      if (["simulateBtn", "simulateBtnInline", "simulateBtnFloating"].includes(button.id)) {
        const record = document.getElementById("record")?.textContent || "";
        if (!/\d+\s*-\s*\d+/.test(record) && !nba82Started) {
          nba82Started = true;
          emit("nba82_started", "nba82");
          queueMicrotask(markNba82Complete);
        }
      } else if (["battleStartSeries", "battleQuickSeries", "battleCoachSeries"].includes(button.id)) {
        markNba5Started("nba5");
        queueMicrotask(markNba5Complete);
      } else if (button.id === "generateShareBtn") {
        globalThis.setTimeout(markShareComplete, 50);
      }
    }, true);
  }

  function installRoomFetchObserver() {
    if (!nativeFetch) return;
    globalThis.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      try {
        const input = args[0];
        const options = args[1] || {};
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
        const method = String(options.method || input?.method || "GET").toUpperCase();
        if (response.ok && method === "POST" && url.origin === location.origin) {
          if (url.pathname === "/api/battle/rooms") emit("room_created", "online");
          else if (/^\/api\/battle\/rooms\/[^/]+\/join$/.test(url.pathname)) emit("room_joined", "online");
          else if (/^\/api\/battle\/rooms\/[^/]+\/start$/.test(url.pathname)) {
            emit("room_started", "online");
            markNba5Started("online");
            const payload = await response.clone().json().catch(() => null);
            if (payload?.room?.status === "complete") {
              nba5Started = false;
              emit("nba5_completed", "online");
            }
          } else if (/^\/api\/battle\/rooms\/[^/]+\/series\/start-ready$/.test(url.pathname)) {
            markNba5Started("online");
          }
        }
        if (response.ok && url.origin === location.origin
          && /^\/api\/battle\/rooms\/[^/]+(?:\/series(?:\/start-ready)?|\/games\/[^/]+\/(?:strategy|reveal|next-ready))$/.test(url.pathname)) {
          const payload = await response.clone().json().catch(() => null);
          if (completedCoachSeries(payload)) {
            if (!nba5Started) markNba5Started("online");
            markNba5Complete("online");
            if (nba5Started) {
              nba5Started = false;
              emit("nba5_completed", "online");
            }
          }
        }
      } catch {
        // The original response is returned unchanged even if observation fails.
      }
      return response;
    };
  }

  installRoomFetchObserver();
  installGameObservers();
  markModeEntered();
  markPackOpened();
  markLineupComplete();
  emit("session_start", "home", { once: true });
  document.documentElement.dataset.productAnalyticsStatus = "ready";
  document.documentElement.dataset.productAnalyticsVersion = configuration.releaseVersion;

  globalThis.addEventListener("pagehide", () => {
    if (flushTimer !== null) globalThis.clearTimeout(flushTimer);
    flushTimer = null;
    void flush();
  });

  const publicApi = Object.freeze({
    schemaVersion: "product-analytics-client-1.2.0",
    configuration,
    emit,
    flush,
  });
  globalThis.ProductAnalytics = publicApi;
  globalThis.ProductAnalyticsCandidate = publicApi;
})();
