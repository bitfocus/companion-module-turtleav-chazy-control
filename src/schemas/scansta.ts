import { z } from 'zod'

/**
 * Chazy Control – Device scan status response schema (`getjson.cgi` — `scansta` section)
 *
 * This is presumably the status behind the Device Management search commands
 * (`SEARCH`, `GET SEARCH STATUS`, `SEARCH RESET` — see `device-management.ts`).
 *
 * Notes:
 * - `scanning` is a clear 0/1 state flag (is a scan currently in progress),
 *   typed as `zBinaryFlag`. `defnew` was also observed as `0` but its name
 *   doesn't read as unambiguously boolean, so it's left as `z.number()`.
 * - `rslval`/`rslstr` are presumably a result code and message for the last
 *   scan, but only `0`/`""` have been observed — kept as an open
 *   `z.number()`/`z.string()` rather than a narrower type.
 * - `newin`/`projin`/`newout`/`projout` were all empty in the observed sample
 *   — shape unconfirmed, typed as `z.array(z.unknown())`. Given the `in`/`out`
 *   = encoders/decoders convention confirmed elsewhere (see `mxsta.ts`'s
 *   `devtype` "-TX"/"-RX" suffixes), these are presumably newly-found vs.
 *   already-in-project encoders (`*in`) and decoders (`*out`) from the scan —
 *   not confirmed, since no sample has had a device to populate them with.
 */

const zBinaryFlag = z.union([z.literal(0), z.literal(1)]).transform((value) => value === 1)

export const ChazyScanStaResponseSchema = z.object({
	docver: z.int(),
	scanning: zBinaryFlag,
	defnew: z.number(), // meaning unconfirmed
	rslval: z.number(),
	rslstr: z.string(),
	newin: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
	projin: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
	newout: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
	projout: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
})

export type ChazyScanStaResponse = z.infer<typeof ChazyScanStaResponseSchema>
