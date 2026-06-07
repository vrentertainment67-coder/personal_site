// src/pages/rss.xml.js
//
// Adds an RSS feed at https://djvicofficial.com/rss.xml
// The monthly mailer script reads this feed to auto-pull your latest blog posts.

import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  // CHECK 1 resolved: collection is 'blog' ✓
  const posts = await getCollection('blog');

  return rss({
    title: 'DJ VIC — Notes from Behind the Decks',
    description: 'Mixes, gigs, gear, and the stories behind the sets.',
    site: context.site, // pulled from astro.config.mjs `site: 'https://djvicofficial.com'`
    items: posts
      // CHECK 2 resolved: schema uses `publishDate` (coerce.date, optional) or `date` (string, optional)
      .sort((a, b) => {
        const da = a.data.publishDate ?? (a.data.date ? new Date(a.data.date) : new Date(0));
        const db = b.data.publishDate ?? (b.data.date ? new Date(b.data.date) : new Date(0));
        return db - da;
      })
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.publishDate ?? (post.data.date ? new Date(post.data.date) : undefined),
        description: post.data.description,
        // CHECK 3 resolved: Astro 5/6 uses post.id; blog lives at /blog/[slug]/ ✓
        link: `/blog/${post.id}/`,
      })),
    customData: `<language>en-in</language>`,
  });
}
