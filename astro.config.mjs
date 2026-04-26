// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://djvicofficial.com',
  integrations: [
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
        const priorities = {
          'https://djvicofficial.com/':           { priority: 1.0, changefreq: 'weekly' },
          'https://djvicofficial.com/weddings/':  { priority: 0.9, changefreq: 'weekly' },
          'https://djvicofficial.com/corporate/': { priority: 0.9, changefreq: 'weekly' },
          'https://djvicofficial.com/sangeet/':   { priority: 0.8, changefreq: 'monthly' },
          'https://djvicofficial.com/nightlife/': { priority: 0.8, changefreq: 'monthly' },
          'https://djvicofficial.com/private-events/': { priority: 0.8, changefreq: 'monthly' },
          'https://djvicofficial.com/private-sessions/': { priority: 0.7, changefreq: 'monthly' },
          'https://djvicofficial.com/thevicfix/': { priority: 0.7, changefreq: 'weekly' },
          'https://djvicofficial.com/remixes/':   { priority: 0.6, changefreq: 'monthly' },
          'https://djvicofficial.com/photos/':    { priority: 0.6, changefreq: 'monthly' },
        };
        return { ...item, ...(priorities[item.url] ?? {}) };
      },
    }),
  ],
});
