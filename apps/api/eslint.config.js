// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
	globalIgnores(['dist/', '.wrangler/', 'worker-configuration.d.ts']),

	js.configs.recommended,

	// Type-aware rules: floating promises, misused promises, awaiting non-thenables...
	tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},

	// Config files live outside the Worker's tsconfig
	{
		files: ['**/*.js'],
		extends: [tseslint.configs.disableTypeChecked],
	},
);
