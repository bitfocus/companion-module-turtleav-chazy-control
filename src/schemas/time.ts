import { z } from 'zod'

/**
 * Chazy Control – Time status response schema (`getjson.cgi` — Time section)
 *
 * Notes:
 * - `time` is validated against the observed `YYYY/MM/DD HH:mm:ss` format
 *   rather than treated as a free-form string, since it represents an
 *   actual timestamp. Loosen to `z.string()` if the format turns out to
 *   vary (e.g. once the device clock/tz is actually set vs. this default
 *   1970 epoch-ish sample).
 * - `tz` was empty in the observed sample — shape/values unconfirmed
 *   (likely an IANA tz name or UTC offset once configured). Left open as
 *   `z.string()` rather than an enum.
 */

const CHAZY_TIME_FORMAT = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/

export const ChazyTimeResponseSchema = z.compile(
	z.object({
		docver: z.number(),
		time: z.string().regex(CHAZY_TIME_FORMAT, 'Expected time in "YYYY/MM/DD HH:mm:ss" format'),
		tz: z.string(),
	}),
)

export type ChazyTimeResponse = z.infer<typeof ChazyTimeResponseSchema>
