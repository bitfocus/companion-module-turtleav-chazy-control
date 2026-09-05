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

const zBinaryFlag = z.union([z.literal(0), z.literal(1)]).transform((value) => value === 1)

export const ChazyPingResponseSchema = z.compile(
	z.object({
		addr: z.string(),
		result: z.array(z.string()),
		success: zBinaryFlag,
	}),
)

export type ChazyPingResponse = z.infer<typeof ChazyPingResponseSchema>
