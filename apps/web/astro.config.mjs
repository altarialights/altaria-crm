// @ts-check
import { defineConfig, envField } from 'astro/config';

import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';
import { esES } from '@clerk/localizations';
import tailwindcss from '@tailwindcss/vite';

// Without keys Clerk would silently create a throwaway dev instance; fail loudly instead
process.env.CLERK_KEYLESS_DISABLED ??= 'true';

// https://astro.build/config
export default defineConfig({
  // Clerk needs on-demand rendering; every page is server-rendered on Vercel
  output: 'server',
  adapter: vercel(),

  env: {
    schema: {
      // Base URL of the API Worker, inlined into client code at build time
      PUBLIC_API_URL: envField.string({ context: 'client', access: 'public', default: 'http://localhost:8787' }),
    },
  },

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
