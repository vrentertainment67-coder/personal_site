/* ============================================================
   DJ VIC — pageview tracker (privacy-friendly, no cookies)
   Add ONCE to your Astro base layout, before </body>:

     <script src="/tracker.js" defer></script>

   Put this file in your Astro /public folder so it serves at /tracker.js.
   Set the two constants below to your Supabase project values.
   ============================================================ */
(function () {
  // Never track dev/localhost (preview loads) or flagged-out browsers (Vic's own).
  // Visiting any page with ?notrack flags that browser permanently.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  try {
    if (location.search.indexOf("notrack") > -1) localStorage.setItem("vic_notrack", "1");
    if (localStorage.getItem("vic_notrack")) return;
  } catch (e) { /* localStorage blocked — carry on */ }

  var SUPABASE_URL = "https://jftnhuutttmccmqnnybf.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_ysWygc3QGKbfsUd0f7Evzw__98TEoo9";

  // anonymous, stable-per-browser id (random; not tied to any PII)
  var KEY = "vic_vid";
  var vid = localStorage.getItem(KEY);
  if (!vid) {
    vid = (crypto.randomUUID && crypto.randomUUID()) ||
          (Date.now().toString(36) + Math.random().toString(36).slice(2));
    localStorage.setItem(KEY, vid);
  }

  // First-touch traffic source — stored once, used to tag booking requests.
  if (!localStorage.getItem("vic_source")) {
    var ref = document.referrer || "";
    var src = !ref ? "Direct"
      : /instagram/i.test(ref) ? "Instagram"
      : /google/i.test(ref) ? "Google"
      : /wa\.me|whatsapp/i.test(ref) ? "WhatsApp"
      : /facebook|fb\./i.test(ref) ? "Facebook"
      : /youtube/i.test(ref) ? "YouTube"
      : /djvicofficial/i.test(ref) ? "" : "Other";
    if (src) localStorage.setItem("vic_source", src);
  }

  fetch(SUPABASE_URL + "/rest/v1/rpc/track_pageview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: "Bearer " + SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      p_path: location.pathname,
      p_ref: document.referrer || "",
      p_visitor: vid,
    }),
    keepalive: true,
  }).catch(function () { /* never block the page on analytics */ });
})();
