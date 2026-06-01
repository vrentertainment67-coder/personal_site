// Registry of replaceable in-house page images. Each maps a `slot` key (also set
// as data-img-slot="..." on the element) to a friendly label + page.
// The admin "Page Images" tab lists these; the Layout swap-script applies overrides.
// type: "bg" = background-image element, "img" = <img>. Add a row + a data-img-slot
// attribute on the element to make any new image replaceable.
export const IMAGE_SLOTS = [
  { slot: "home.weddings-bg", label: "Weddings card background", page: "Home", type: "bg" },
  { slot: "home.corporate-bg", label: "Corporate card background", page: "Home", type: "bg" },
  { slot: "weddings.hero", label: "Weddings — hero background", page: "Weddings", type: "bg" },
  { slot: "corporate.hero", label: "Corporate — hero background", page: "Corporate", type: "bg" },
  { slot: "sangeet.hero", label: "Sangeet — hero background", page: "Sangeet", type: "bg" },
  { slot: "nightlife.hero", label: "Nightlife — hero background", page: "Nightlife", type: "bg" },
  { slot: "private-events.hero", label: "Private Events — hero background", page: "Private Events", type: "bg" },
  { slot: "private-sessions.hero", label: "Private Sessions — hero background", page: "Private Sessions", type: "bg" },
  { slot: "festivals.hero", label: "Festivals — hero background", page: "Festivals", type: "bg" },
  { slot: "thevicfix.hero", label: "The Vic Fix — hero background", page: "The Vic Fix", type: "bg" },
  { slot: "remixes.hero", label: "Remixes — hero background", page: "Remixes", type: "bg" },
  { slot: "photos.hero", label: "Gallery — hero background", page: "Gallery", type: "bg" },
];
