/* ============================================================
   DJ VIC — pageview tracker (privacy-friendly, no cookies)
   Add ONCE to your Astro base layout, before </body>:

     <script src="/tracker.js" defer></script>

   Put this file in your Astro /public folder so it serves at /tracker.js.
   Set the two constants below to your Supabase project values.
   ============================================================ */
(function () {
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
