import { beforeEach, vi } from 'vitest'
import type { LoggingSink } from '@companion-module/base'

/**
 * `createModuleLogger` routes through `global.COMPANION_LOGGER` when one is set, otherwise
 * falling back to a `console.log` sink that the base package documents as a placeholder for
 * the host application to replace.
 *
 * Several tests deliberately exercise failure paths (an unreachable device, an unparseable
 * response), so without a sink installed their expected error logs clutter the test output
 * and read like real failures. Route them into a spy instead — which also lets a test assert
 * on what was logged, via `expect(companionLogger).toHaveBeenCalledWith(...)`.
 */
export const companionLogger = vi.fn<LoggingSink>()

globalThis.COMPANION_LOGGER = companionLogger

beforeEach(() => {
	companionLogger.mockClear()
})
