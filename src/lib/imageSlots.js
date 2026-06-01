// Registry of replaceable in-house page images. Each maps a `slot` key (also set
// as data-img-slot="..." on the element) to a friendly label, page, recommended
// upload size, and the CURRENT/default image (shown in the admin until replaced).
// The admin "Page Images" tab lists these; the Layout swap-script applies overrides.
// All backgrounds use `background-size: cover` — match orientation, upload high-res.
// Add a row + a data-img-slot attribute on the element to make any image replaceable.
export const IMAGE_SLOTS = [
  { slot: "home.weddings-bg", label: "Weddings card background", page: "Home", size: "1200 × 800 px · landscape", default: "/images/rf/fc1c338a80d635c2429d234301f2ba98.jpg" },
  { slot: "home.corporate-bg", label: "Corporate card background", page: "Home", size: "1200 × 800 px · landscape", default: "/images/rf/c26853944612fd45df1fe9d9f6d3417f.jpg" },
  { slot: "weddings.hero", label: "Weddings — hero background", page: "Weddings", size: "1920 × 1080 px · landscape", default: "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=85" },
  { slot: "corporate.hero", label: "Corporate — hero background", page: "Corporate", size: "1920 × 1080 px · landscape", default: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&q=85" },
  { slot: "sangeet.hero", label: "Sangeet — hero background", page: "Sangeet", size: "1920 × 1080 px · landscape", default: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1600&q=85" },
  { slot: "nightlife.hero", label: "Nightlife — hero background", page: "Nightlife", size: "1920 × 1080 px · landscape", default: "https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?w=1600&q=85" },
  { slot: "private-events.hero", label: "Private Events — hero background", page: "Private Events", size: "1920 × 1080 px · landscape", default: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1600&q=85" },
  { slot: "private-sessions.hero", label: "Private Sessions — hero background", page: "Private Sessions", size: "1920 × 1080 px · landscape", default: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1600&q=80" },
  { slot: "festivals.hero", label: "Festivals — hero background", page: "Festivals", size: "1920 × 1080 px · landscape", default: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=85" },
  { slot: "thevicfix.hero", label: "The Vic Fix — hero background", page: "The Vic Fix", size: "1920 × 1080 px · landscape", default: "/images/rf/e94568f5bfc73623b03fccac9a9c7a5d.jpg" },
  { slot: "remixes.hero", label: "Remixes — hero background", page: "Remixes", size: "1920 × 1080 px · landscape", default: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=85" },
  { slot: "photos.hero", label: "Gallery — hero background", page: "Gallery", size: "1920 × 1080 px · landscape", default: "/images/rf/cbcb21ad3960fc82de8f296e385e745e.jpg" },
];
