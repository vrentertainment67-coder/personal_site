// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://djvicofficial.com',
  integrations: [
    mdx(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      customPages: [
        'https://djvicofficial.com/',
        'https://djvicofficial.com/weddings/',
        'https://djvicofficial.com/corporate/',
        'https://djvicofficial.com/thevicfix/',
        'https://djvicofficial.com/remixes/',
        'https://djvicofficial.com/photos/',
        'https://djvicofficial.com/sangeet/',
        'https://djvicofficial.com/nightlife/',
        'https://djvicofficial.com/private-events/',
        'https://djvicofficial.com/private-sessions/',
      ],
      serialize(item) {
        const exact = {
          'https://djvicofficial.com/':                 { priority: 1.0, changefreq: 'weekly' },
          'https://djvicofficial.com/weddings/':        { priority: 0.9, changefreq: 'weekly' },
          'https://djvicofficial.com/corporate/':       { priority: 0.9, changefreq: 'weekly' },
          'https://djvicofficial.com/sangeet/':         { priority: 0.8, changefreq: 'monthly' },
          'https://djvicofficial.com/nightlife/':       { priority: 0.8, changefreq: 'monthly' },
          'https://djvicofficial.com/private-events/':  { priority: 0.8, changefreq: 'monthly' },
          'https://djvicofficial.com/private-sessions/':{ priority: 0.7, changefreq: 'monthly' },
          'https://djvicofficial.com/thevicfix/':       { priority: 0.8, changefreq: 'weekly' },
          'https://djvicofficial.com/remixes/':         { priority: 0.7, changefreq: 'weekly' },
          'https://djvicofficial.com/photos/':          { priority: 0.6, changefreq: 'monthly' },
          'https://djvicofficial.com/events/':          { priority: 0.7, changefreq: 'weekly' },
          'https://djvicofficial.com/blog/':            { priority: 0.7, changefreq: 'weekly' },
        };
        if (exact[item.url]) return { ...item, ...exact[item.url] };
        // Episode pages — /thevicfix/[slug]/
        if (item.url.startsWith('https://djvicofficial.com/thevicfix/'))
          return { ...item, priority: 0.75, changefreq: 'monthly' };
        // Remix pages — /remixes/[slug]/
        if (item.url.startsWith('https://djvicofficial.com/remixes/'))
          return { ...item, priority: 0.65, changefreq: 'monthly' };
        // Blog posts — /blog/[slug]/
        if (item.url.startsWith('https://djvicofficial.com/blog/'))
          return { ...item, priority: 0.65, changefreq: 'monthly' };
        // Event pages — /events/[slug]/
        if (item.url.startsWith('https://djvicofficial.com/events/'))
          return { ...item, priority: 0.6, changefreq: 'weekly' };
        return { ...item, priority: 0.5, changefreq: 'monthly' };
      },
    }),
  ],
});
