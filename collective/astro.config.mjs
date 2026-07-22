// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Bengaluru DJs Collective — its own site, its own domain.
// Deployed separately from djvicofficial.com (see collective/README.md).
export default defineConfig({
  site: 'https://bengalurudjscollective.com',
  integrations: [react(), sitemap()],
});
