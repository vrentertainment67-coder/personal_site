// ============================================================
// Inventory master catalogue — Lloyds Pro Sound
// ============================================================
// A curated, de-duplicated master list of every piece of gear that appears
// across Lloyd's quotations, with a standard day-rate. This is the single
// source of truth shared by two pages:
//   • /inventory        — the master list editor (rate card + stock counts)
//   • /invoice          — "Add item" picks from this catalogue
//
// The live copy is stored in localStorage under INVENTORY_KEY so edits on the
// inventory page immediately feed the invoice builder. `qtyOwned` and `notes`
// are the stock-sheet columns (blank until Lloyd fills them in).

export const INVENTORY_KEY = 'lloyds-inventory-v1';

export const INVENTORY_CATEGORIES = [
  'Sound',
  'Backline & Stage',
  'Lighting',
  'Crew & Services',
  'Logistics',
];

// item: { id, name, category, rate, qtyOwned, notes }
export const DEFAULT_INVENTORY = [
  // ── Sound ──────────────────────────────────────────────
  { id: 'inv-adamson-s10', name: 'Adamson S10 Line Array Top', category: 'Sound', rate: 4000, qtyOwned: '', notes: '' },
  { id: 'inv-adamson-e119', name: 'Adamson E119 Subwoofer', category: 'Sound', rate: 4000, qtyOwned: '', notes: '' },
  { id: 'inv-lab-amp', name: 'Lab Gruppen Amplifier', category: 'Sound', rate: 3750, qtyOwned: '', notes: '' },
  { id: 'inv-stage-rack', name: 'Stage Rack', category: 'Sound', rate: 2000, qtyOwned: '', notes: '' },
  { id: 'inv-dj-console', name: 'Pioneer CDJ-3000 + DJM-A9 Mixer (DJ Console)', category: 'Sound', rate: 8000, qtyOwned: '', notes: '' },
  { id: 'inv-side-fills', name: 'Side Fills (JBL VRX — 2 tops + 2 subs)', category: 'Sound', rate: 6000, qtyOwned: '', notes: '' },
  { id: 'inv-cordless-mic', name: 'Cordless Handheld Mic', category: 'Sound', rate: 1000, qtyOwned: '', notes: '' },
  { id: 'inv-dlive-700', name: 'Allen & Heath dLive S700 Mixer', category: 'Sound', rate: 35000, qtyOwned: '', notes: '' },
  { id: 'inv-hexical-antenna', name: 'Wireless Antenna Distro (Hexical)', category: 'Sound', rate: 2000, qtyOwned: '', notes: '' },
  { id: 'inv-band-accessories', name: 'Band Accessories — Full Set', category: 'Sound', rate: 4000, qtyOwned: '', notes: '' },
  { id: 'inv-talkback', name: 'Talkback Speaker & Mics', category: 'Sound', rate: 5000, qtyOwned: '', notes: '' },

  // ── Backline & Stage ───────────────────────────────────
  { id: 'inv-amp-guitar', name: 'Guitar Amp — Fender Twin Reverb', category: 'Backline & Stage', rate: 4000, qtyOwned: '', notes: '' },
  { id: 'inv-amp-bass', name: 'Bass Amp — Hartke 5500 + 4×10 Cabinet', category: 'Backline & Stage', rate: 4000, qtyOwned: '', notes: '' },
  { id: 'inv-amp-key', name: 'Keyboard Amp — Roland KC-550', category: 'Backline & Stage', rate: 4000, qtyOwned: '', notes: '' },
  { id: 'inv-montage', name: 'Yamaha Montage 6/7 Keyboard', category: 'Backline & Stage', rate: 10000, qtyOwned: '', notes: '' },
  { id: 'inv-key-stand', name: 'Keyboard Stand — 2 Tier', category: 'Backline & Stage', rate: 750, qtyOwned: '', notes: '' },
  { id: 'inv-drum-kit', name: 'Drum Kit — Pearl', category: 'Backline & Stage', rate: 18000, qtyOwned: '', notes: '' },
  { id: 'inv-drum-mics', name: 'Drum Mic Set — Sennheiser EW 900', category: 'Backline & Stage', rate: 4000, qtyOwned: '', notes: '' },
  { id: 'inv-kick-mic', name: 'Kick Drum Mic — Shure (In / Out)', category: 'Backline & Stage', rate: 1000, qtyOwned: '', notes: '' },
  { id: 'inv-drum-sub', name: 'Drum Subwoofer', category: 'Backline & Stage', rate: 3000, qtyOwned: '', notes: '' },
  { id: 'inv-di-box', name: 'DI Box', category: 'Backline & Stage', rate: 400, qtyOwned: '', notes: '' },
  { id: 'inv-wedge', name: 'Wedge Monitor', category: 'Backline & Stage', rate: 1500, qtyOwned: '', notes: '' },
  { id: 'inv-iem', name: 'Sennheiser 2000-Series In-Ear Monitor', category: 'Backline & Stage', rate: 2000, qtyOwned: '', notes: '' },
  { id: 'inv-wedge-iem', name: 'Wedge Monitor + IEM (combo)', category: 'Backline & Stage', rate: 3500, qtyOwned: '', notes: '' },
  { id: 'inv-sm58-wireless', name: 'Shure SM58 — Wireless Handheld', category: 'Backline & Stage', rate: 1000, qtyOwned: '', notes: '' },
  { id: 'inv-sm58-wired', name: 'Shure SM58 — Wired + Boom Stand', category: 'Backline & Stage', rate: 400, qtyOwned: '', notes: '' },
  { id: 'inv-beta58', name: 'Shure Beta 58A / QLX-D Wireless Vocal Mic', category: 'Backline & Stage', rate: 1500, qtyOwned: '', notes: '' },
  { id: 'inv-sax-mic', name: 'Saxophone Clip Mic — Shure Beta 98H', category: 'Backline & Stage', rate: 1000, qtyOwned: '', notes: '' },
  { id: 'inv-phono', name: 'Phono-to-Phono Jack Cables', category: 'Backline & Stage', rate: 0, qtyOwned: '', notes: '' },
  { id: 'inv-fan', name: 'Floor Fan', category: 'Backline & Stage', rate: 1000, qtyOwned: '', notes: '' },

  // ── Lighting ───────────────────────────────────────────
  { id: 'inv-led-par', name: 'LED Par RGB', category: 'Lighting', rate: 450, qtyOwned: '', notes: '' },
  { id: 'inv-blinder', name: 'Blinder', category: 'Lighting', rate: 500, qtyOwned: '', notes: '' },
  { id: 'inv-warm-white', name: 'Warm White Par', category: 'Lighting', rate: 300, qtyOwned: '', notes: '' },
  { id: 'inv-mh-sharpy', name: 'Moving Head — Sharpy Beam', category: 'Lighting', rate: 2000, qtyOwned: '', notes: '' },
  { id: 'inv-batten', name: 'LED Batten', category: 'Lighting', rate: 1000, qtyOwned: '', notes: '' },
  { id: 'inv-mh-wash', name: 'Moving Head Wash', category: 'Lighting', rate: 1500, qtyOwned: '', notes: '' },
  { id: 'inv-t-truss', name: 'T-Truss', category: 'Lighting', rate: 3000, qtyOwned: '', notes: '' },
  { id: 'inv-goalpost', name: 'Goal Post Truss (20 × 40)', category: 'Lighting', rate: 20000, qtyOwned: '', notes: '' },
  { id: 'inv-avolites', name: 'Avolites Lighting Console', category: 'Lighting', rate: 3500, qtyOwned: '', notes: '' },
  { id: 'inv-haze', name: 'Haze Machine', category: 'Lighting', rate: 2500, qtyOwned: '', notes: '' },

  // ── Crew & Services ────────────────────────────────────
  { id: 'inv-sound-eng', name: 'Sound Engineer', category: 'Crew & Services', rate: 7500, qtyOwned: '', notes: '' },
  { id: 'inv-light-eng', name: 'Lighting Engineer', category: 'Crew & Services', rate: 5000, qtyOwned: '', notes: '' },
  { id: 'inv-tech-crew', name: 'Technical Crew', category: 'Crew & Services', rate: 12000, qtyOwned: '', notes: '' },

  // ── Logistics ──────────────────────────────────────────
  { id: 'inv-transport', name: 'Transportation (To & Fro, per vehicle)', category: 'Logistics', rate: 8000, qtyOwned: '', notes: '' },
];
