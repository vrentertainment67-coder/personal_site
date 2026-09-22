// The Rider — single source of truth for the editions, shared by the hub
// (/therider) and the per-edition tracked landing pages (/therider/ep10/…).
// `slug` powers the landing URL; `file` is the public PDF it opens.
// Newest first.
export const EDITIONS = [
  {
    no: '10', slug: 'ep10', icon: '💪', file: '/TheRider-Ep10-BodyWorkingManual.pdf',
    title: 'DJing At 40',
    kicker: 'The Working Manual',
    sub: 'DJing at 40 is a choice you make at 25. The working manual for the DJ’s body — pre-gig, in the booth, post-set, and across the week.',
    inside: [
      'The 48-hour pre-gig protocol — sleep, hydration, the alcohol cutoff, footwear',
      'The in-booth protocol, hour by hour — stay as sharp in hour six as hour one',
      'The 12-hour post-set protocol — the recovery window nobody teaches',
      'The 7-day gig-week structure — the whole week built around one Saturday set',
      'The micro-movement library — five moves you can do in the booth, plus the science',
    ],
  },
  {
    no: '09', slug: 'ep09', icon: '🧭', file: '/TheRider-Ep09-2030FieldGuide.pdf',
    title: 'DJing In 2030',
    kicker: 'The 2030 Field Guide',
    sub: 'It’s not dying — it’s moving. Where dance music is actually heading in the next five years, and the moves to make now.',
    inside: [
      'The seven trends already visible — from Western club contraction to India’s demographic wave',
      'Push / Pull / Cost — why the shift is structural, not cyclical',
      'The five moves to make in the next 12 months',
      'The local audit — ten questions to spot the shift in your own city',
      'Go deeper — the reports and journalists worth tracking as it unfolds',
    ],
  },
  {
    no: '08', slug: 'ep08', icon: '🤖', file: '/TheRider-Ep08-AIProofPlaybook.pdf',
    title: 'The Machine Can Mix Now',
    kicker: 'The AI-Proof Playbook',
    sub: 'The AI tools reshaping DJing — and the four moves that keep you irreplaceable.',
    inside: [
      'The tool stack — what’s actually shipped, from Serato Stems to Tunee AI and Suno',
      'The four moves that keep you irreplaceable when the machine can mix',
      'Why technical skill is now the floor, not the ceiling — and where to move your hours',
      'The weekly / monthly / quarterly rhythm to build it into your practice',
      'Go deeper — Carl Cox, Peggy Gou and Fred Again on surviving the AI shift',
    ],
  },
  {
    no: '07', slug: 'ep07', icon: '💭', file: '/TheRider-Ep07-MomentsFieldGuide.pdf',
    title: 'You Play Memories',
    kicker: 'The Field Guide',
    sub: 'The science of music and memory — and how the best DJs build a set around it.',
    inside: [
      'The prediction problem — why the room’s reaction has little to do with your mix',
      'The reminiscence bump — the ages that shape a crowd’s deepest musical memories',
      'Case study: how Peggy Gou engineered a 300M-stream hit off a ’98 anthem',
      'The pre-set worksheet — ten questions that make the set write itself',
      'Further reading — the papers and books behind the science',
    ],
  },
  {
    no: '06', slug: 'ep06', icon: '🧠', file: '/TheRider-Ep06-BrainFieldGuide.pdf',
    title: 'Your Brain On DJing',
    kicker: 'The Field Guide',
    sub: 'What’s actually happening behind the decks — and the neuroscience behind it.',
    inside: [
      'The Prediction Problem — how you beatmatch before you consciously notice',
      'Your four memory systems, running in parallel every set',
      'The room-reading loop: why a good set is literally a conversation',
      'Why DJing sharpens skills that carry beyond the booth',
      'Further reading — papers, books and lectures',
    ],
  },
  {
    no: '05', slug: 'ep05', icon: '🎧', file: '/TheRider-Ep05-Ears-Toolkit.pdf',
    title: 'Protect Your Ears',
    kicker: 'Hearing Toolkit',
    sub: 'The habits, the earplug brands, and the audiologist checklist.',
    inside: [
      'The five habits that protect your hearing behind the booth',
      'Custom musician’s earplug brands — India + international',
      'The audiologist appointment checklist — what to ask, what to test',
      'The warning signs — when to skip the wait and see someone',
    ],
  },
  {
    no: '04', slug: 'ep04', icon: '📝', file: '/TheRider-Ep04-Contract.pdf',
    title: 'The One-Page Contract',
    kicker: 'Booking Sheet',
    sub: 'The single sheet that turns a WhatsApp gig into a professional booking. India & beyond.',
    inside: [
      'A fill-in DJ contract — parties, fee, cancellation tiers, force majeure',
      'The soft-launch script for sending it without friction',
      'Handling pushback — what to say when they resist',
      'How to adapt it for your region (US / UK / EU)',
    ],
  },
  {
    no: '03', slug: 'ep03', icon: '🧾', file: '/TheRider-Ep03-TDS-Toolkit.pdf',
    title: 'The Cut Nobody Explained',
    kicker: 'TDS Toolkit',
    sub: 'Invoice template + checklist, so you never lose a rupee to bad paperwork.',
    inside: [
      'The one-page TDS cheat sheet — rates, thresholds, when it kicks in',
      'The DJ invoice template — fill it in, send it, get paid right',
      'The five-move checklist that actually protects you',
      'Form 16A + Form 26AS — what they are and how to get them',
    ],
  },
  {
    no: '02', slug: 'ep02', icon: '📊', file: '/TheRider-Ep02-FeeFloorWorksheet.pdf',
    title: 'Know Your Floor',
    kicker: 'Fee-Floor Worksheet',
    sub: 'The worksheet that tells you the number below which every gig is losing you money.',
    inside: [
      'The three questions your fee floor answers',
      'The worksheet — real hours + real costs = your minimum viable fee',
      'Two worked examples — a club DJ and a wedding DJ',
      'How to actually quote higher — anchor high, cut scope not price',
    ],
  },
  {
    no: '01', slug: 'ep01', icon: '🛡️', file: '/TheRider-Ep01-InsuranceStarter.pdf',
    title: 'The Cover Nobody Buys',
    kicker: 'Insurance Starter',
    sub: 'The DJ’s starter guide to insurance — what to buy, what to skip, how not to overpay.',
    inside: [
      'The three covers every DJ needs — health, accident, term life',
      'The five questions to ask before you buy',
      'The comparison-shopping playbook — India + global',
      'The red flags in the fine print that void your claim',
    ],
  },
];
