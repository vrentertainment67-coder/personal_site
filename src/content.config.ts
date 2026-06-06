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
    youtubeId: z.string(),
    category: z.enum(['behind-the-decks', 'room-makers', 'architects', 'other-side-of-the-bar', 'bigger-picture']),
    categoryLabel: z.string(),
    tagline: z.string(),
    bio: z.string(),
    pullQuote: z.string().optional(),
    guestPhoto: z.string().optional(),
    guestInstagram: z.string().optional(),
    topics: z.array(z.string()).default([]),
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
    youtubeId: z.string(),
    type: z.enum(['mashup', 'remix', 'edit', 'rework']).default('mashup'),
    genre: z.array(z.string()).default([]),
    tracks: z.array(z.string()).default([]),
    artists: z.array(z.string()).default([]),
    description: z.string(),
    releaseDate: z.string(),
    audiomackSlug: z.string().optional(),
  }),
});

export const collections = { blog, events, vicfixEpisodes, remixes };
