// @ts-check
import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
	globalIgnores(['dist/', '.astro/', '.vercel/']),

	js.configs.recommended,

	// Type-aware rules: floating promises, misused promises, awaiting non-thenables...
	tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},

	// React: hooks/useEffect rules from the official plugin, the rest from eslint-react.
	{
		files: ['src/**/*.{js,jsx,ts,tsx}'],
		extends: [eslintReact.configs['recommended-type-checked'], reactHooks.configs.flat.recommended],
		rules: {
			// Already covered by eslint-plugin-react-hooks
			'@eslint-react/error-boundaries': 'off',
			'@eslint-react/exhaustive-deps': 'off',
			'@eslint-react/purity': 'off',
			'@eslint-react/rules-of-hooks': 'off',
			'@eslint-react/set-state-in-effect': 'off',
			'@eslint-react/set-state-in-render': 'off',
			'@eslint-react/static-components': 'off',
			'@eslint-react/unsupported-syntax': 'off',
			'@eslint-react/use-memo': 'off',
		},
	},

	astro.configs.recommended,
	{
		files: ['**/*.astro'],
		extends: [tseslint.configs.disableTypeChecked],
	},
);
