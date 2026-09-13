import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['src/tests/**/*.test.ts'],
		setupFiles: ['src/tests/setup.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			// text for the CI log, lcov for Codecov (node.yaml uploads ./coverage/lcov.info), html for browsing locally
			reporter: ['text', 'lcov', 'html'],
			reportsDirectory: './coverage',
			include: ['src/**/*.ts'],
			// Test files and the shared test setup, not shipped code
			exclude: ['src/tests/**'],
		},
	},
})
