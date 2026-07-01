import { z } from 'zod'

/**
 * Chazy Control – Dante status response schema (`getjson.cgi` — Dante section)
 *
 * Notes:
 * - Many numeric fields below are 0/1 flags in the firmware's JSON. They're
 *   typed as a literal union (rather than `z.number()`) so any future
 *   firmware value outside {0, 1} fails validation loudly instead of
 *   silently passing through as an unexpected number.
 * - `clksrc`, `sync`, `primultiv1/2`, `secmultiv1/2`, and channel `status`/
 *   `type` are typed as open `z.string()` rather than `z.enum([...])`, since
 *   only a single sample response was available to infer values from.
 *   Tighten these to enums once more device states have been observed
 *   (e.g. fault/error states on `rxchn[].status`, or "video" on `type`).
 * - `ddm.domains` and `dante[].txflow` are typed as `z.array(z.unknown())`
 *   since both were empty in the observed sample — shape unconfirmed.
 */

const zBinaryFlag = z.union([z.literal(0), z.literal(1)])

const ControllerSchema = z.object({
	vip: z.string(),
	vsm: z.string(),
})

const DdmSchema = z.object({
	server: z.string(),
	port: z.number(),
	state: z.string(),
	current_domain: z.string(),
	domains: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
})

const DanteRxChannelSchema = z.object({
	type: z.string(), // observed: "audio"
	name: z.string(),
	id: z.number(),
	subdev: z.string(),
	subchn: z.string(),
	status: z.string(), // observed: "SUBSCRIBE_SELF" | "NONE" | "DYNAMIC"
})

const DanteTxChannelSchema = z.object({
	type: z.string(), // observed: "audio"
	name: z.string(),
	id: z.number(),
	enable: zBinaryFlag,
})

const DanteDeviceSchema = z.object({
	name: z.string(),
	unlicensed: zBinaryFlag,
	ol: zBinaryFlag,
	primac: z.string(),
	pristatic: zBinaryFlag,
	col: zBinaryFlag,
	priip: z.string(),
	primask: z.string(),
	prigw: z.string(),
	pridns: z.string(),
	prispeed: z.number(),
	secip: z.string(),
	secspeed: z.number(),
	manfname: z.string(),
	manfmodel: z.string(),
	modelver: z.string(),
	dantemodel: z.string(),
	owndep: zBinaryFlag,
	swver: z.string(),
	clksrc: z.string(), // observed: "INTERNAL"
	sync: z.string(), // observed: "NONE" | "SYNC"
	mute: zBinaryFlag,
	intfmode: z.number(),
	primultiv1: z.string(), // observed: "MASTER" | "SLAVE"
	primultiv2: z.string(), // observed: "DISABLED"
	secmultiv1: z.string(),
	secmultiv2: z.string(),
	aes67spt: zBinaryFlag,
	aes67on: zBinaryFlag,
	aes67prefix: z.number(),
	clrconfspt: zBinaryFlag,
	preferredspt: zBinaryFlag,
	preferred: zBinaryFlag,
	aes67dev: zBinaryFlag,
	aes67src: z.string(),
	aes67sid: z.number(),
	aes67clk: z.number(),
	aes67pridest: z.string(),
	resetspt: zBinaryFlag,
	setratespt: zBinaryFlag,
	setencodingspt: zBinaryFlag,
	staticipspt: zBinaryFlag,
	pullupspt: zBinaryFlag,
	rxlatencylist: z.array(z.number()),
	rxlatencymin: z.number(),
	rxlatency: z.number(),
	rxlatencymax: z.number(),
	lock: zBinaryFlag,
	srate: z.number(),
	srate_array: z.array(z.number()),
	enc: z.number(),
	encs_array: z.array(z.number()),
	rxchn: z.array(DanteRxChannelSchema),
	txchn: z.array(DanteTxChannelSchema),
	txflow: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
})

export const ChazyDanteResponseSchema = z.object({
	docver: z.number(),
	controller: ControllerSchema,
	ddm: DdmSchema,
	dante: z.array(DanteDeviceSchema),
})

export type ChazyDanteResponse = z.infer<typeof ChazyDanteResponseSchema>
export type DanteDevice = z.infer<typeof DanteDeviceSchema>
export type DanteRxChannel = z.infer<typeof DanteRxChannelSchema>
export type DanteTxChannel = z.infer<typeof DanteTxChannelSchema>
