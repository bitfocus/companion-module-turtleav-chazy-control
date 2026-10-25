import { z } from 'zod'

/**
 * Chazy Control – Ping response schema (`getjson.cgi` — `ping` section)
 *
 * Notes:
 * - `result` is a list of raw output lines from the device's underlying
 *   `ping` command/log, not one line per attempt in any guaranteed order —
 *   the observed sample includes a `"bad address"` line alongside a
 *   `"[SUCCESS] ... is reachable."` line for the same address, so this looks
 *   like accumulated output across retries rather than a single result.
 *   `success` is the field to trust for the overall outcome.
 * - No `docver` field here, unlike most other sections.
 */

/**
 * The device's 0/1 flags, as a boolean, with any non-zero value reading as true.
 *
 * Deliberately not a strict `0 | 1` union. These flag fields are guesses made from their names against a single
 * device's response, and nothing in the module reads any of them — they are carried only so the whole object can be
 * pushed into a variable. A strict union made one wrong guess fatal: a site with VLANs configured reported a `dvtag`
 * outside 0/1, which failed the entire mxsta parse and left the module with no encoders, decoders, presets or
 * variables. A wrong guess should cost an imprecise flag, not the feature set.
 */
const zBinaryFlag = z.number().transform((value) => value !== 0)

export const ChazyPingResponseSchema = z.compile(
	z.object({
		addr: z.string(),
		result: z.array(z.string()),
		success: zBinaryFlag,
	}),
)

export type ChazyPingResponse = z.infer<typeof ChazyPingResponseSchema>
