// ============================================================
// DJ VIC — motion layer
// Premium on desktop (fine pointer + ≥1025px), light on mobile.
// Bundled by Astro; re-scans the DOM on every astro:page-load so
// it survives View Transitions. Fully disabled under
// prefers-reduced-motion (content is shown statically).
// ============================================================
const html = document.documentElement;
const REDUCED = html.classList.contains("motion-reduce");
const PREMIUM = html.classList.contains("fx-premium");

// Reveal/count systems need .fx-ready on <html> so the CSS hides
// reveal targets only when JS is actually running.
if (!REDUCED) html.classList.add("fx-ready");

// ── Easing helper ──────────────────────────────────────────────
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ── rAF-safe "now" (Date.now avoided per harness, but this is the
//    browser runtime so performance.now is fine here) ────────────
const now = () => performance.now();

/* ============================================================
   1. SCROLL REVEALS  (all devices, IntersectionObserver)
   ============================================================ */
let revealIO = null;
function initReveals() {
  if (REDUCED || !("IntersectionObserver" in window)) return;
  if (revealIO) revealIO.disconnect();
  revealIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          revealIO.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -7% 0px" }
  );
  document.querySelectorAll(".fx-reveal:not(.is-in)").forEach((el) => revealIO.observe(el));
}

/* ============================================================
   2. COUNT-UP  (all devices)
   Reads existing text to derive prefix / number / suffix, so
   markup just needs  data-count  on the element.
   ============================================================ */
function parseCount(text) {
  const m = String(text).trim().match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  return { prefix: m[1] || "", target: parseFloat(m[2].replace(/,/g, "")), suffix: m[3] || "", raw: m[2] };
}
function animateCount(el) {
  const meta = parseCount(el.dataset.count || el.textContent);
  if (!meta) return;
  const decimals = (meta.raw.split(".")[1] || "").length;
  const dur = 1500;
  const start = now();
  function tick() {
    const p = Math.min(1, (now() - start) / dur);
    const val = meta.target * easeOut(p);
    el.textContent = meta.prefix + val.toFixed(decimals) + meta.suffix;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = meta.prefix + meta.raw + meta.suffix;
  }
  requestAnimationFrame(tick);
}
let countIO = null;
function initCounters() {
  const els = document.querySelectorAll("[data-count]:not([data-counted])");
  if (!els.length) return;
  if (REDUCED || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.setAttribute("data-counted", "1"));
    return;
  }
  if (countIO) countIO.disconnect();
  countIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.setAttribute("data-counted", "1");
          animateCount(e.target);
          countIO.unobserve(e.target);
        }
      });
    },
    { threshold: 0.4 }
  );
  els.forEach((el) => countIO.observe(el));
}

/* ============================================================
   3. KINETIC SPLIT-TEXT  (premium only)
   Wraps each word of a .fx-split element and staggers it in.
   ============================================================ */
function initSplit() {
  // Only run once gsap is ready — keeps the headline static (and visible via
  // the CSS fallback) until we can animate it, so there's never a flash.
  if (!PREMIUM || !window.__gsap) return;
  document.querySelectorAll(".fx-split:not([data-split-done])").forEach((el) => {
    el.setAttribute("data-split-done", "1");
    const spans = [];
    const frag = document.createDocumentFragment();
    Array.prototype.forEach.call(el.childNodes, (node) => {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach((p) => {
          if (p === "") return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          const outer = document.createElement("span");
          outer.className = "fx-word";
          const inner = document.createElement("span");
          inner.className = "fx-word-i";
          inner.textContent = p;
          inner.style.transform = "translateY(115%)";
          outer.appendChild(inner);
          frag.appendChild(outer);
          spans.push(inner);
        });
      } else {
        // keep <br> and any inline elements intact
        frag.appendChild(node.cloneNode(true));
      }
    });
    el.innerHTML = "";
    el.appendChild(frag);
    el.style.opacity = "1";
    window.__gsap.to(spans, {
      yPercent: 0,
      duration: 0.9,
      ease: "power3.out",
      stagger: 0.04,
      delay: 0.1,
    });
  });
}

/* ============================================================
   4. PREMIUM: Lenis + GSAP + cursor + magnetic (lazy-loaded)
   ============================================================ */
async function initPremium() {
  if (!PREMIUM || window.__premiumInit) return;
  window.__premiumInit = true;

  const [{ default: Lenis }, gsapMod] = await Promise.all([
    import("lenis"),
    import("gsap"),
  ]);
  const gsap = gsapMod.gsap || gsapMod.default;
  window.__gsap = gsap;

  const { ScrollTrigger } = await import("gsap/ScrollTrigger");
  gsap.registerPlugin(ScrollTrigger);
  window.__ScrollTriggerRef = ScrollTrigger;

  // ── Lenis smooth scroll ──────────────────────────────────────
  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.5,
  });
  window.__lenis = lenis;
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Anchor links → Lenis smooth scroll
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -80 }); }
  });

  // ── Custom cursor (dot + lagging ring) ───────────────────────
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  document.body.appendChild(dot);
  document.body.appendChild(ring);
  document.body.classList.add("cursor-on");
  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my;
  window.addEventListener("mousemove", (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px)`;
  });
  function ringLoop() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(ringLoop);
  }
  ringLoop();
  // Grow ring over interactive elements
  const HOVER_SEL = "a, button, .magnetic, [role='button'], input, textarea, select";
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest && e.target.closest(HOVER_SEL)) ring.classList.add("is-hover");
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest && e.target.closest(HOVER_SEL)) ring.classList.remove("is-hover");
  });

  // ── Hero parallax (subtle) ───────────────────────────────────
  bindGsapEffects(gsap, ScrollTrigger);

  // Initialise the split headline now that gsap is ready
  initSplit();
}

function bindGsapEffects(gsap, ScrollTrigger) {
  // Subtle parallax on any [data-parallax] element
  document.querySelectorAll("[data-parallax]:not([data-parallax-done])").forEach((el) => {
    el.setAttribute("data-parallax-done", "1");
    const amount = parseFloat(el.getAttribute("data-parallax")) || 12;
    gsap.to(el, {
      yPercent: amount,
      ease: "none",
      scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true },
    });
  });
  ScrollTrigger.refresh();
}

/* ============================================================
   5. MAGNETIC BUTTONS  (premium only)
   ============================================================ */
function initMagnetic() {
  if (!PREMIUM) return;
  document.querySelectorAll(".magnetic:not([data-mag-done])").forEach((el) => {
    el.setAttribute("data-mag-done", "1");
    const strength = parseFloat(el.getAttribute("data-mag")) || 0.35;
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    });
    el.addEventListener("mouseleave", () => { el.style.transform = "translate(0,0)"; });
  });
}

/* ============================================================
   6. PRELOADER dismissal
   ============================================================ */
function dismissPreloader() {
  const pre = document.getElementById("preloader");
  if (!pre) return;
  const done = () => { pre.classList.add("is-done"); html.classList.remove("preload-on"); };
  // Hide after the page is interactive (or immediately if already loaded)
  if (document.readyState === "complete") setTimeout(done, 350);
  else window.addEventListener("load", () => setTimeout(done, 350), { once: true });
  // Hard safety: never trap the user
  setTimeout(done, 2500);
}

/* ============================================================
   Boot + re-scan on View Transitions
   ============================================================ */
function scan() {
  initReveals();
  initCounters();
  initSplit();
  initMagnetic();
  if (window.__gsap && window.__ScrollTriggerRef) {
    bindGsapEffects(window.__gsap, window.__ScrollTriggerRef);
  }
}

function boot() {
  dismissPreloader();
  scan();
  if (PREMIUM) {
    // idle import so it never blocks first paint / LCP
    if ("requestIdleCallback" in window) requestIdleCallback(() => initPremium(), { timeout: 1200 });
    else setTimeout(() => initPremium(), 300);
  }
}

// Initial load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

// Re-scan after every Astro View Transition navigation
document.addEventListener("astro:page-load", () => {
  scan();
  if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true });
  if (window.__ScrollTriggerRef) window.__ScrollTriggerRef.refresh();
});
