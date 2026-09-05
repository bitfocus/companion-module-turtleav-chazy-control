import { describe, expect, it } from 'vitest'
import { ChazyControlEventResponseSchema } from '../schemas/controlevent.js'
import { ChazyControlEventLogResponseSchema } from '../schemas/controleventlog.js'
import { ChazyDanteResponseSchema } from '../schemas/dante.js'
import { ChazyDantePresetResponseSchema } from '../schemas/dantepreset.js'
import { ChazyDevUpgradeResponseSchema } from '../schemas/devupgrade.js'
import { ChazyMxStaResponseSchema } from '../schemas/mxsta.js'
import { ChazyPingResponseSchema } from '../schemas/ping.js'
import { ChazyScanStaResponseSchema } from '../schemas/scansta.js'
import { ChazyTimeResponseSchema } from '../schemas/time.js'
import { ChazyUserStaResponseSchema } from '../schemas/usersta.js'

/**
 * Every response schema is wrapped in `z.compile()` so the polled parses in `api.ts`'s
 * `#pollSchema` run on zod's generated fast path rather than the runtime interpreter.
 *
 * `compile()` is deliberately non-strict in the schema files: a schema it cannot model is
 * returned *unchanged* and quietly keeps using the runtime parser. That makes losing the
 * fast path invisible at runtime — hence this guard. Adding an async refinement, or any
 * other feature the fast path can't express, will fail here.
 *
 * `_zod.bag.fallbackRun` is set only on a successfully compiled schema. It is zod internals,
 * so if a future zod version reshapes it this test fails loudly and the marker needs
 * rechecking — which is the intent: a silent pass would be worse.
 */
function isCompiled(schema: unknown): boolean {
	const bag = (schema as { _zod?: { bag?: object } })._zod?.bag
	return bag !== undefined && 'fallbackRun' in bag
}

const schemas = {
	controlevent: ChazyControlEventResponseSchema,
	controleventlog: ChazyControlEventLogResponseSchema,
	dante: ChazyDanteResponseSchema,
	dantepreset: ChazyDantePresetResponseSchema,
	devupgrade: ChazyDevUpgradeResponseSchema,
	mxsta: ChazyMxStaResponseSchema,
	ping: ChazyPingResponseSchema,
	scansta: ChazyScanStaResponseSchema,
	time: ChazyTimeResponseSchema,
	usersta: ChazyUserStaResponseSchema,
}

describe('response schemas are AOT-compiled', () => {
	it.each(Object.keys(schemas))('%s uses the compiled fast path', (name) => {
		expect(isCompiled(schemas[name as keyof typeof schemas])).toBe(true)
	})

	it('rejects invalid input through the compiled path', () => {
		// Guards against compilation weakening validation rather than just speeding it up.
		expect(ChazyTimeResponseSchema.safeParse({ docver: 1, time: 'not a timestamp', tz: '' }).success).toBe(false)
		expect(ChazyTimeResponseSchema.safeParse({ docver: 1, time: '1970/01/05 02:09:27', tz: '' }).success).toBe(true)
	})

	it('applies the zBinaryFlag 0/1 -> boolean transform through the compiled path', () => {
		const parsed = ChazyPingResponseSchema.parse({ addr: '1.2.3.4', result: [], success: 1 })
		expect(parsed.success).toBe(true)
		expect(ChazyPingResponseSchema.safeParse({ addr: '1.2.3.4', result: [], success: 2 }).success).toBe(false)
	})
})
