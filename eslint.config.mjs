import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'
import tseslint from 'typescript-eslint'

const config = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...config,
	{
		// Not covered by tsconfig.json/tsconfig.build.json (both only include src/**/*.ts),
		// so it can't be type-checked — parse it without type info instead.
		files: ['vitest.config.ts'],
		...tseslint.configs.disableTypeChecked,
	},
	{
		// vitest is a devDependency on purpose — tests aren't part of the published module.
		files: ['src/tests/**/*.ts', 'vitest.config.ts'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
]
