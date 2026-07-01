import { z } from 'zod'

/**
 * Chazy Control – Dante preset list response schema (`getjson.cgi` — `dante_preset` section)
 */

const DantePresetSchema = z.object({
	id: z.number(),
	name: z.string(),
})

export const ChazyDantePresetResponseSchema = z.object({
	dante_preset: z.array(DantePresetSchema),
})

export type ChazyDantePresetResponse = z.infer<typeof ChazyDantePresetResponseSchema>
export type DantePreset = z.infer<typeof DantePresetSchema>
