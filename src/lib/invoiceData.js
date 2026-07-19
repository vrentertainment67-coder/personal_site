// ============================================================
// Invoice seed data — Lloyds Pro Sound
// ============================================================
// This is the "template" that powers the clickable invoice builder
// (src/components/InvoiceBuilder.jsx). It mirrors the A26 Band & DJ Jas
// quotation (28 Aug 2026, Adamson) exactly, and doubles as the master
// catalogue of line items Lloyd can toggle on/off per event.
//
// Every item carries a stable `id` so React keys and include/exclude
// state stay put while quantities and rates are edited. Amount is always
// derived (qty × rate) — never stored — so totals can't drift.

export const COMPANY = {
  name: 'LLOYDS PRO SOUND',
  address:
    '#64, Site No. 20 & 21, Horamavu Agara Main Rd, Vaddara Palya, Kalyan Nagar Post, Bangalore - 43.',
  phone: '9845091585',
  email: 'djlloyd10@gmail.com',
  website: 'www.lloydsprosound.com',
};

// Editable company header. `name` + `tagline` form the text wordmark shown
// when no logo image is uploaded. All fields are editable in the builder and
// persist as the default for new invoices.
export const DEFAULT_COMPANY = {
  name: 'LLOYDS',
  tagline: 'PRO SOUND',
  address:
    '#64, Site No. 20 & 21, Horamavu Agara Main Rd, Vaddara Palya, Kalyan Nagar Post, Bangalore - 43.',
  phone: '9845091585',
  email: 'djlloyd10@gmail.com',
  website: 'www.lloydsprosound.com',
};

// Document type label (top-right of the sheet) and closing line — editable.
export const DEFAULT_DOC_TYPE = 'Quotation';
export const DEFAULT_FOOTER = 'Thank you for your business.';

// Default GST split (Karnataka intra-state: CGST 9% + SGST 9% = 18%).
export const TAX = {
  cgstRate: 9,
  sgstRate: 9,
};

// Header details for the seeded event. All editable in the builder.
export const DEFAULT_META = {
  title: 'A26 BAND & DJ JAS',
  client: 'MR Pranish',
  eventDate: '28th Aug 2026',
  setupDate: 'TBC',
  venue: 'Ritz Carlton',
  invoiceNo: '',
  invoiceDate: '',
};

// The standard closing notes (kept verbatim from Lloyd's quotation).
export const DEFAULT_NOTES = [
  'Additional equipment if any ordered, will be charged extra.',
  'Generator would be required exclusively for Sound and Lightings and has to be provided from your end. Generator guys need to carry long copper cables and must be brought up to the console.',
  'Necessary permissions for execution of the event, Band Riser, required tables etc. for console to be provided from your end.',
  'Purchase order to be issued on confirmation before the commencement of event along with approved cost. The same is required for mentioning the value of invoice in the E-Way bills.',
  '50% payment to be made in advance on confirmation of order, by way of NEFT, payable in favour of "LLOYDS", and the balance payment to be made within 30 days from the date of event.',
];

// ------------------------------------------------------------
// Line items, grouped exactly as the source sheet:
//   section  → optional named sub-groups (band members) → items
// item: { id, desc, qty, rate }   amount = qty × rate (derived)
// ------------------------------------------------------------
export const SECTIONS = [
  {
    id: 'sound',
    title: 'Sound',
    groups: [
      {
        id: 'sound-main',
        name: null,
        items: [
          { id: 's1', desc: 'Adamson S10 TOPS', qty: 12, rate: 4000 },
          { id: 's2', desc: 'Adamson Subs E119', qty: 8, rate: 4000 },
          { id: 's3', desc: 'Labgruppen Amps', qty: 4, rate: 3750 },
          { id: 's4', desc: 'Stage Rack', qty: 1, rate: 2000 },
          { id: 's5', desc: 'Pioneer CDJ 3000 & A9 Mixer — DJ Jasmeet', qty: 1, rate: 8000 },
          { id: 's6', desc: 'Side Fills (VRX top 2 nos. / Base 2 nos.)', qty: 1, rate: 6000 },
          { id: 's7', desc: 'Cordless Hand Mic', qty: 4, rate: 1000 },
          { id: 's8', desc: 'DLive Mixer 700', qty: 1, rate: 35000 },
          { id: 's9', desc: 'Hexical Antenna', qty: 1, rate: 2000 },
          { id: 's10', desc: 'Accessories Full Set for Band', qty: 1, rate: 4000 },
          { id: 's11', desc: 'Talk Back Speaker & Mics', qty: 1, rate: 5000 },
          { id: 's12', desc: 'Sound Engineer', qty: 1, rate: 7500 },
        ],
      },
    ],
  },
  {
    id: 'band',
    title: 'Band Requirements — A26 Band',
    groups: [
      {
        id: 'band-lester',
        name: 'Lester Rodrigues',
        items: [
          { id: 'b1', desc: 'Guitar Amp (Fender Twin Reverb)', qty: 1, rate: 4000 },
          { id: 'b2', desc: 'DI-Box', qty: 2, rate: 400 },
          { id: 'b3', desc: 'Sennheiser 2000 In-Ear Monitor', qty: 1, rate: 2000 },
          { id: 'b4', desc: 'Cordless Hand Mic — Shure SM58 with Boom Stand', qty: 1, rate: 1000 },
          { id: 'b5', desc: 'Phono to Phono Jacks', qty: 4, rate: 0 },
          { id: 'b6', desc: 'Wedge Monitor', qty: 1, rate: 1500 },
        ],
      },
      {
        id: 'band-marwino',
        name: 'Marwino — Bass Guitar / Vocals',
        items: [
          { id: 'b7', desc: 'Bass Amp (Hartke 5500 with 4.5 Spkr Cabinet)', qty: 1, rate: 4000 },
          { id: 'b8', desc: 'DI-Box', qty: 2, rate: 400 },
          { id: 'b9', desc: 'Sennheiser 2000 In-Ear Monitor', qty: 1, rate: 2000 },
          { id: 'b10', desc: 'Cord Hand Mic — Shure SM58', qty: 1, rate: 1000 },
          { id: 'b11', desc: 'Phono to Phono Jacks', qty: 2, rate: 0 },
          { id: 'b12', desc: 'Wedge Monitor', qty: 1, rate: 1500 },
          { id: 'b13', desc: 'Keyboard Stand — 2 Tier', qty: 1, rate: 750 },
        ],
      },
      {
        id: 'band-joe',
        name: 'Joe — Drums',
        items: [
          { id: 'b14', desc: 'Drum Kit — Pearl', qty: 1, rate: 18000 },
          { id: 'b15', desc: 'Drum Mics (Sennheiser EW 900)', qty: 1, rate: 4000 },
          { id: 'b16', desc: 'DI-Box', qty: 4, rate: 400 },
          { id: 'b17', desc: 'Wedge Monitor / Sennheiser 2000 In-Ear Monitor', qty: 1, rate: 3500 },
          { id: 'b18', desc: 'Kick In Mic Shure / Kick Out Mic', qty: 2, rate: 1000 },
          { id: 'b19', desc: 'Drum Sub', qty: 1, rate: 3000 },
        ],
      },
      {
        id: 'band-chrystal',
        name: 'Chrystal — Vocals',
        items: [
          { id: 'b20', desc: 'Main Vocals (Beta 58 Mic QLX D)', qty: 1, rate: 1500 },
          { id: 'b21', desc: 'Sennheiser 2000 In-Ear Monitor', qty: 1, rate: 2000 },
          { id: 'b22', desc: 'Wedge Monitor', qty: 1, rate: 1500 },
          { id: 'b23', desc: 'Floor Fan', qty: 1, rate: 1000 },
        ],
      },
      {
        id: 'band-ujjwal',
        name: 'Ujjwal Sewa — Lead Guitar / Vocals',
        items: [
          { id: 'b24', desc: 'DI-Box', qty: 2, rate: 400 },
          { id: 'b25', desc: 'Guitar Amp (Fender Twin Reverb)', qty: 1, rate: 4000 },
          { id: 'b26', desc: 'Wedge Monitor / Sennheiser 2000 In-Ear Monitor', qty: 1, rate: 3500 },
          { id: 'b27', desc: 'Corded Hand Mic — Shure SM58 with Boom Stand', qty: 1, rate: 400 },
        ],
      },
      {
        id: 'band-alfin',
        name: 'Alfin — Keyboard / Vocals',
        items: [
          { id: 'b28', desc: 'DI-Box', qty: 6, rate: 400 },
          { id: 'b29', desc: 'Keyboard Stand — 2 Tier', qty: 1, rate: 750 },
          { id: 'b30', desc: 'Keyboard Amp (Roland KC550)', qty: 1, rate: 4000 },
          { id: 'b31', desc: 'Corded Hand Mic — Shure SM58 on Boom Stand', qty: 1, rate: 400 },
          { id: 'b32', desc: 'Sennheiser 2000 In-Ear Monitor', qty: 1, rate: 2000 },
          { id: 'b33', desc: 'Wedge Monitor', qty: 1, rate: 1500 },
          { id: 'b34', desc: 'Yamaha Montage 6', qty: 1, rate: 10000 },
          { id: 'b35', desc: 'Saxophone Clip Mic Shure 98 H', qty: 1, rate: 1000 },
        ],
      },
      {
        id: 'band-ignatius',
        name: 'Ignatius — Keyboard / Vocals',
        items: [
          { id: 'b36', desc: 'DI-Box', qty: 2, rate: 400 },
          { id: 'b37', desc: 'Keyboard Stand — 2 Tier', qty: 1, rate: 750 },
          { id: 'b38', desc: 'Keyboard Amp (Roland KC550)', qty: 1, rate: 4000 },
          { id: 'b39', desc: 'Corded Hand Mic — Shure SM58 on Boom Stand', qty: 1, rate: 400 },
          { id: 'b40', desc: 'Sennheiser 2000 In-Ear Monitor', qty: 1, rate: 2000 },
          { id: 'b41', desc: 'Wedge Monitor', qty: 1, rate: 1500 },
          { id: 'b42', desc: 'Yamaha Montage 6 or 7', qty: 1, rate: 10000 },
        ],
      },
    ],
  },
  {
    id: 'lighting',
    title: 'Lighting Requirements',
    groups: [
      {
        id: 'lighting-main',
        name: null,
        items: [
          { id: 'l1', desc: 'LED Par RGB', qty: 24, rate: 450 },
          { id: 'l2', desc: 'Blinder', qty: 4, rate: 500 },
          { id: 'l3', desc: 'Warm White', qty: 16, rate: 300 },
          { id: 'l4', desc: 'Moving Head Sharpies', qty: 12, rate: 2000 },
          { id: 'l5', desc: 'Battens', qty: 8, rate: 1000 },
          { id: 'l6', desc: 'Moving Head Wash', qty: 8, rate: 1500 },
          { id: 'l7', desc: 'T-Truss', qty: 2, rate: 3000 },
          { id: 'l8', desc: 'Avolites Lighting', qty: 1, rate: 3500 },
          { id: 'l9', desc: 'Lighting Engineer', qty: 1, rate: 5000 },
          { id: 'l10', desc: 'Goal Post Truss (if required) 20 × 40', qty: 1, rate: 20000 },
          { id: 'l11', desc: 'Haze', qty: 2, rate: 2500 },
        ],
      },
    ],
  },
  {
    id: 'logistics',
    title: 'Transportation & Crew',
    groups: [
      {
        id: 'logistics-main',
        name: null,
        items: [
          { id: 'g1', desc: 'Transportation (To & Fro)', qty: 2, rate: 8000 },
          { id: 'g2', desc: 'Technical Crew', qty: 1, rate: 12000 },
        ],
      },
    ],
  },
];
