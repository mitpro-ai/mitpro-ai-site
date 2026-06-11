(function () {
  try {
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
    const storage = window.localStorage;
    const sessionStorage = window.sessionStorage;
    const key = "mitpro_visitor_id";
    const sessionKey = "mitpro_visit_session_id";
    let visitorId = storage.getItem(key);
    if (!visitorId) {
      visitorId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      storage.setItem(key, visitorId);
    }
    let sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) {
      sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(sessionKey, sessionId);
    }
    const payload = {
      visitor_id: visitorId,
      session_id: sessionId,
      page: `${location.pathname}${location.search}`,
      title: document.title || "",
      referrer: document.referrer || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      language: navigator.language || "",
      screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/visit", blob);
      return;
    }
    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch (error) {
    // Visitor tracking must never interrupt the public website.
  }
})();
