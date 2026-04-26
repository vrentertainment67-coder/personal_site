import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    tags: z.array(z.string()).optional(),
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
    topics: z.array(z.string()).default([]),
    publishDate: z.string(),
    viewCount: z.string().default(''),
    featured: z.boolean().default(false),
  }),
});

export const collections = { blog, events, vicfixEpisodes };
