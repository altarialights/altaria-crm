// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import clerk from '@clerk/astro';
import { esES } from '@clerk/localizations';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Clerk needs on-demand rendering; every page is server-rendered on Cloudflare Workers
  output: 'server',
  // No Cloudflare Images binding: images are served as-is
  adapter: cloudflare({ imageService: 'passthrough' }),
  // Clerk owns the user session, so Astro sessions (and their KV namespace) are off
  session: false,

  integrations: [
    react(),
    clerk({
      localization: esES,
      signInUrl: '/login',
      afterSignOutUrl: '/login',
    }),
  ],

  vite: {
    plugins: [tailwindcss()]
  }
});
