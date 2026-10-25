import { z } from 'zod'

/**
 * Chazy Control – Device upgrade status response schema (`getjson.cgi` — `devupgrade` section)
 *
 * Not currently polled — added ahead of wiring up device firmware upgrade support.
 *
 * Notes:
 * - `UploadFile`, `History`, and `Action` were all empty in the observed sample —
 *   shape unconfirmed, typed as `z.array(z.unknown())`.
 * - `ActionProgress` and `DevAction` were empty strings in the observed sample —
 *   meaning/format unconfirmed (e.g. `ActionProgress` may turn out to be a
 *   percentage once an upgrade is actually in progress).
 * - Field names are PascalCase here, unlike most other sections — this matches
 *   the device's own JSON exactly, not a transcription choice.
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

export const ChazyDevUpgradeResponseSchema = z.compile(
	z.object({
		docver: z.int(),
		UploadFile: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
		History: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
		Action: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
		ActionProgress: z.string(),
		Upgrading: zBinaryFlag,
		DevAction: z.string(),
	}),
)

export type ChazyDevUpgradeResponse = z.infer<typeof ChazyDevUpgradeResponseSchema>
