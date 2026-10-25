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
import { VALID_MXSTA_RESPONSE, emptyDecoderStatus, emptyEncoderStatus } from './fixtures.js'

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

/**
 * Reported from a 20-encoder / 7-decoder site (chazycontrol.ebc.nvidia.com): every `dvtag`, and `arccap` on two
 * decoders, came back outside 0/1, so the strict flag union failed the whole mxsta parse. `#pollSchema` logs and
 * moves on, so the module kept polling but never stored an mxsta — leaving no encoders, decoders, presets or
 * variables. The exact values were not in the report; these stand in for "not 0 or 1".
 */
describe('mxsta tolerates device values outside the guessed 0/1 flag range', () => {
	const payload = {
		...VALID_MXSTA_RESPONSE,
		in: [{ ...emptyEncoderStatus(), id: 1, name: 'Encoder 001', ip: '169.254.1.1', dvtag: 100 }],
		out: [{ ...emptyDecoderStatus(), id: 1, name: 'Decoder 001', ip: '169.254.2.1', dvtag: 100, arccap: 2 }],
	}

	it('parses a response carrying a VLAN tag and an ARC capability level', () => {
		expect(ChazyMxStaResponseSchema.safeParse(payload).success).toBe(true)
	})

	it('keeps the reported values rather than coercing them to flags', () => {
		const parsed = ChazyMxStaResponseSchema.parse(payload)

		expect(parsed.in[0].dvtag).toBe(100)
		expect(parsed.out[0].dvtag).toBe(100)
		expect(parsed.out[0].arccap).toBe(2)
	})

	it('still reads a genuine flag as a boolean, and treats any non-zero as set', () => {
		const parsed = ChazyMxStaResponseSchema.parse({
			...payload,
			in: [{ ...emptyEncoderStatus(), dvlan: 0, sig: 1, led: 2 }],
		})

		expect(parsed.in[0].dvlan).toBe(false)
		expect(parsed.in[0].sig).toBe(true)
		expect(parsed.in[0].led).toBe(true)
	})
})

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
		const ping = (success: unknown) => ChazyPingResponseSchema.safeParse({ addr: '1.2.3.4', result: [], success })

		expect(ChazyPingResponseSchema.parse({ addr: '1.2.3.4', result: [], success: 1 }).success).toBe(true)
		expect(ChazyPingResponseSchema.parse({ addr: '1.2.3.4', result: [], success: 0 }).success).toBe(false)
		// Still a number check — the flag only tolerates unexpected numbers, not the wrong type
		expect(ping('1').success).toBe(false)
	})
})
