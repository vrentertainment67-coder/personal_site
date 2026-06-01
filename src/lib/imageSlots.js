// Registry of replaceable in-house page images. Each maps a `slot` key (also set
// as data-img-slot="..." on the element) to a friendly label, page, and the
// recommended upload size. The admin "Page Images" tab lists these; the Layout
// swap-script applies overrides.
// type: "bg" = background-image element, "img" = <img>. All backgrounds use
// `background-size: cover`, so match the orientation/ratio and upload high-res.
// Add a row + a data-img-slot attribute on the element to make any new image
// replaceable.
export const IMAGE_SLOTS = [
  { slot: "home.weddings-bg", label: "Weddings card background", page: "Home", type: "bg", size: "1200 × 800 px · landscape" },
  { slot: "home.corporate-bg", label: "Corporate card background", page: "Home", type: "bg", size: "1200 × 800 px · landscape" },
  { slot: "weddings.hero", label: "Weddings — hero background", page: "Weddings", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "corporate.hero", label: "Corporate — hero background", page: "Corporate", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "sangeet.hero", label: "Sangeet — hero background", page: "Sangeet", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "nightlife.hero", label: "Nightlife — hero background", page: "Nightlife", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "private-events.hero", label: "Private Events — hero background", page: "Private Events", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "private-sessions.hero", label: "Private Sessions — hero background", page: "Private Sessions", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "festivals.hero", label: "Festivals — hero background", page: "Festivals", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "thevicfix.hero", label: "The Vic Fix — hero background", page: "The Vic Fix", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "remixes.hero", label: "Remixes — hero background", page: "Remixes", type: "bg", size: "1920 × 1080 px · landscape" },
  { slot: "photos.hero", label: "Gallery — hero background", page: "Gallery", type: "bg", size: "1920 × 1080 px · landscape" },
];
