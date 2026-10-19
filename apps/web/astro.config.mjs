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
      PUBLIC_API_URL: envField.string({ context: 'client', access: 'public', default: 'https://altaria-crm.altarialights.workers.dev' }),
    },
  },

  integrations: [
    react(),
    clerk({
      localization: esES,
      // Brand tokens from src/styles/global.css (Clerk can't read CSS variables): keep them in sync
      appearance: {
        variables: {
          colorPrimary: '#1d6fc0', // brand-600
          colorForeground: '#0f2c56', // brand-900
          colorMutedForeground: '#42556a', // ink-600
          colorNeutral: '#0f2c56', // brand-900, tints borders and hovers
          fontFamily: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
          borderRadius: '0.5rem',
        },
      },
      signInUrl: '/login',
      afterSignOutUrl: '/login',
    }),
  ],

  vite: {
    plugins: [tailwindcss()]
  }
});
