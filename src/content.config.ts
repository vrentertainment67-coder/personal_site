import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Legacy field (old .md posts)
    date: z.string().optional(),
    // New fields (current .mdx posts)
    publishDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('DJ VIC'),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    ogImage: z.string().optional(),
    dateModified: z.string().optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    venue: z.string(),
    address: z.string().optional(),
    city: z.string(),
    date: z.string(),
    time: z.string(),
    ticketed: z.boolean().default(false),
    guestListAvailable: z.boolean().default(false),
    isPrivate: z.boolean().default(false),
    dresscode: z.string().optional(),
    genre: z.array(z.string()).default([]),
    hostedBy: z.string().optional(),
    videoSetBy: z.string().optional(),
    creativeImage: z.string().optional(),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    guestListFormId: z.string().default('xbdqanrk'),
  }),
});

const vicfixEpisodes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/vicfix' }),
  schema: z.object({
    guestName: z.string(),
    guestTitle: z.string(),
    season: z.number(),
    episode: z.number(),
    youtubeId: z.string().optional().default(''),
    category: z.enum(['behind-the-decks', 'room-makers', 'architects', 'other-side-of-the-bar', 'bigger-picture', 'lab']),
    categoryLabel: z.string(),
    // Optional overrides for special formats (e.g. The Lab): replace the
    // "S2 · E17 · {categoryLabel}" eyebrow and the "Season 2" breadcrumb.
    episodeLabel: z.string().optional(),
    sectionLabel: z.string().optional(),
    // When there's no video yet, the "premiering" placeholder says this (e.g.
    // "today", "this Sunday"). Defaults to "this Sunday".
    premiereWhen: z.string().optional(),
    tagline: z.string(),
    bio: z.string(),
    pullQuote: z.string().optional(),
    guestPhoto: z.string().optional(),
    guestInstagram: z.string().optional(),
    topics: z.array(z.string()).default([]),
    duration: z.string().optional().default(''),
    publishDate: z.string(),
    seoDescription: z.string().optional(),
    viewCount: z.string().default(''),
    featured: z.boolean().default(false),
  }),
});

const remixes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/remixes' }),
  schema: z.object({
    title: z.string(),
    // YouTube showcase tracks set this. Download-only tracks leave it blank
    // (defaults to '') and render from `artwork` instead of a video embed.
    youtubeId: z.string().default(''),
    type: z.enum(['mashup', 'remix', 'edit', 'rework']).default('mashup'),
    genre: z.array(z.string()).default([]),
    tracks: z.array(z.string()).default([]),
    artists: z.array(z.string()).default([]),
    description: z.string(),
    releaseDate: z.string(),
    audiomackSlug: z.string().optional(),

    // ── Optional free-download block ──────────────────────────────────────
    // When `mp3Url` is set, the detail page shows a download button + email
    // capture. Host MP3s on Supabase Storage (public bucket: remixes) — never
    // commit audio to the repo. The page appends ?download= automatically so
    // Supabase sends Content-Disposition: attachment.
    mp3Url: z.string().url().optional(),
    downloadName: z.string().optional(),   // "DJ VIC - Title.mp3"
    fileSize: z.string().optional(),       // "10.5 MB"
    artwork: z.string().optional(),        // "/images/remixes/<slug>.jpg" (public/)
    bpm: z.number().int().positive().optional(),
    musicalKey: z.string().optional(),
    duration: z.string().optional(),       // "4:12"
    keyword: z.string().optional(),        // the Instagram keyword that sends people here
    // Search visibility, per track. Existing showcase tracks stay indexed
    // (default false = indexed); flip true to keep a page out of search.
    noindex: z.boolean().default(false),
  }),
});

export const collections = { blog, events, vicfixEpisodes, remixes };
