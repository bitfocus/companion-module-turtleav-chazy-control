import { z } from 'zod'

/**
 * Chazy Control – Matrix status response schema (`getjson.cgi` — `mxsta` section)
 *
 * "mxsta" is presumed to mean "Matrix Status" (unconfirmed — not spelled out
 * anywhere in the observed API) — the umbrella object covering core device
 * status, network config, I/O, groups, media routing, and video wall state.
 *
 * Notes:
 * - `in`, `out`, `config.cfg`, `groups`, and `medias` were all empty in the
 *   observed sample — shape unconfirmed, typed as `z.array(z.unknown())`.
 * - Most numeric flags follow the device's usual 0/1 convention and are
 *   typed as `zBinaryFlag`. A few (`iodir`, `ioset`, `ioget`, `dns_mode`,
 *   `*_ipmode`, `mode`, `cloud_server_code`) look like bitmasks or wider
 *   enums rather than simple booleans, so they're left as `z.number()`.
 * - `cloud_server_en` is the one field that's a genuine JSON `boolean`
 *   rather than a 0/1 number — that's an inconsistency in the device API
 *   itself, not a transcription error here.
 * - `devpassword` is included as `z.string()` but is sensitive (looks like
 *   an encrypted/encoded credential) — worth scrubbing before logging any
 *   parsed response that contains it.
 * - `sg*` fields (`sgconn`, `sgtype`, `sgid`, `sgrsp`) — meaning unconfirmed,
 *   typed conservatively (numbers/strings) without assuming semantics.
 */

const zBinaryFlag = z.union([z.literal(0), z.literal(1)])

const SysStaSchema = z.object({
	devname: z.string(),
	time: z.string(), // same "YYYY/MM/DD HH:mm:ss" shape as the dedicated time section
	tz: z.string(),
	softver: z.string(),
	ir: zBinaryFlag,
	rs232: zBinaryFlag,
	iodir: z.number(), // likely a bitmask
	ioset: z.number(), // likely a bitmask
	ioget: z.number(), // likely a bitmask
	busy: zBinaryFlag,
	devuser: z.string(),
	devpassword: z.string(), // sensitive — encrypted/encoded, do not log as-is
	sgconn: z.number(),
	sgtype: z.number(),
	sgid: z.number(),
	sgrsp: z.string(),
	uuid: z.string(),
	sip: z.string(),
	domainid: z.number(),
	verify: zBinaryFlag,
	verifyinfo: z.string(),
	dnsname: z.string(),
	dantevalid: zBinaryFlag,
	cloud: zBinaryFlag,
	timezone: z.string(),
	zonename: z.string(),
	ntpserver: z.string(),
	cloud_server_en: z.boolean(), // note: real boolean, unlike the 0/1 flags elsewhere in this object
	cloud_server_addr: z.string(),
	cloud_server_port: z.number(),
	cloud_server_lan: z.number(),
	cloud_server_conn: z.number(),
	cloud_server_code: z.number(),
})

const NetStaSchema = z.object({
	cdhcp: zBinaryFlag,
	cip: z.string(),
	cgw: z.string(),
	csm: z.string(),
	cmac: z.string(),
	vdhcp: zBinaryFlag,
	vip: z.string(),
	vgw: z.string(),
	vsm: z.string(),
	vmac: z.string(),
	dns_mode: z.number(),
	dns_prefer: z.string(),
	dns_backup: z.string(),
	dns_port: z.number(),
	enc_preset_ipmode: z.number(),
	enc_preset_ip_min: z.string(),
	enc_preset_ip_max: z.string(),
	enc_preset_netmask: z.string(),
	enc_preset_gateway: z.string(),
	dec_preset_ipmode: z.number(),
	dec_preset_ip_min: z.string(),
	dec_preset_ip_max: z.string(),
	dec_preset_netmask: z.string(),
	dec_preset_gateway: z.string(),
	ipmode: z.number(),
	txipbegain: z.string(), // sic — matches the device API's spelling
	txipend: z.string(),
	rxipbegain: z.string(), // sic — matches the device API's spelling
	rxipend: z.string(),
	https: zBinaryFlag,
	tnenable: zBinaryFlag, // presumed telnet enable
	sshenable: zBinaryFlag,
	telnet: z.number(), // port number
	ssh: z.number(), // port number
})

const ConfigSchema = z.object({
	cfg: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
})

const VideoWallOutCfgSchema = z.object({
	scrid: z.number(),
	ow: z.number(),
	vw: z.number(),
	oh: z.number(),
	vh: z.number(),
})

const VideoWallGroupSchema = z.object({
	id: z.string(),
	scrid: z.array(z.number()),
	fr: z.number(), // meaning unconfirmed — possibly "framed"/frame-enable flag
})

const VideoWallCfgSchema = z.object({
	id: z.number(),
	name: z.string(),
	group: z.array(VideoWallGroupSchema),
	single: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
})

const VideoWallSchema = z.object({
	id: z.number(),
	name: z.string(),
	mode: z.number(),
	row: z.number(),
	col: z.number(),
	cfgsel: z.number(),
	outarr: z.array(z.number()),
	outcfg: z.array(VideoWallOutCfgSchema),
	cfg: z.array(VideoWallCfgSchema),
})

export const ChazyMxStaResponseSchema = z.object({
	docver: z.number(),
	syssta: SysStaSchema,
	netsta: NetStaSchema,
	in: z.array(z.unknown()), // shape unconfirmed
	out: z.array(z.unknown()), // shape unconfirmed
	config: ConfigSchema,
	groups: z.array(z.unknown()), // shape unconfirmed
	medias: z.array(z.unknown()), // shape unconfirmed
	vw: z.array(VideoWallSchema),
})

export type ChazyMxStaResponse = z.infer<typeof ChazyMxStaResponseSchema>
export type SysSta = z.infer<typeof SysStaSchema>
export type NetSta = z.infer<typeof NetStaSchema>
export type VideoWall = z.infer<typeof VideoWallSchema>
