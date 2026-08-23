import { z } from 'zod'

/**
 * Chazy Control – User status response schema (`getjson.cgi` — `usersta` section)
 *
 * Notes:
 * - `ctrloutput` and `canselinput` were observed as the literal string `"all"` —
 *   likely also capable of holding a comma-separated id list like `canselpreset`
 *   (e.g. `"0,1,2,3"`), but only the `"all"` value has been observed so far, so
 *   both are left as open `z.string()` rather than a narrower union.
 * - `canselpreset` is a comma-separated list of preset ids, e.g. `"0,1,2,3,4,5,6,7"`.
 * - `normaluser` and `adminuser` share the same per-account shape.
 */

const UserAccountSchema = z.object({
	name: z.string(),
	ctrloutput: z.string(),
	canselinput: z.string(),
	canselpreset: z.string(),
})

export const ChazyUserStaResponseSchema = z.object({
	docver: z.int(),
	normaluser: z.array(UserAccountSchema),
	adminuser: z.array(UserAccountSchema),
})

export type ChazyUserStaResponse = z.infer<typeof ChazyUserStaResponseSchema>
export type UserAccount = z.infer<typeof UserAccountSchema>
