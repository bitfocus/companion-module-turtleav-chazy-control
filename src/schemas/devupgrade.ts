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

const zBinaryFlag = z.union([z.literal(0), z.literal(1)]).transform((value) => value === 1)

export const ChazyDevUpgradeResponseSchema = z.object({
	docver: z.int(),
	UploadFile: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
	History: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
	Action: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
	ActionProgress: z.string(),
	Upgrading: zBinaryFlag,
	DevAction: z.string(),
})

export type ChazyDevUpgradeResponse = z.infer<typeof ChazyDevUpgradeResponseSchema>
