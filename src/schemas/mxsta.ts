import { z } from 'zod'

/**
 * Chazy Control – Matrix status response schema (`getjson.cgi` — `mxsta` section)
 *
 * "mxsta" is presumed to mean "Matrix Status" (unconfirmed — not spelled out
 * anywhere in the observed API) — the umbrella object covering core device
 * status, network config, encoder/decoder status, groups, media routing, and
 * video wall state.
 *
 * Notes:
 * - `config.cfg`, `groups`, and `medias` were all empty in every observed
 *   sample — shape unconfirmed, typed as `z.array(z.unknown())`.
 * - `in` and `out` are arrays of per-device status objects — encoders and
 *   decoders respectively, confirmed by their `devtype` suffixes ("-TX" for
 *   `in`, "-RX" for `out`). Both have a large number of fields whose exact
 *   semantics aren't documented anywhere in the observed API; fields that
 *   look like simple 0/1 toggles by name are typed as `zBinaryFlag`, and
 *   anything that looks like it could hold more than two values (indices,
 *   modes, ids, timing values) is left as `z.number()` even where only 0/1
 *   has been observed, per the same conservative approach used for `syssta`
 *   and `netsta` below.
 * - Most numeric flags follow the device's usual 0/1 convention and are
 *   typed as `zBinaryFlag`. A few (`iodir`, `ioset`, `ioget`, `dns_mode`,
 *   `*_ipmode`, `mode`, `cloud_server_code`, and the encoder/decoder `im`/
 *   `lan2_im` fields) look like bitmasks or wider enums rather than simple
 *   booleans, so they're left as `z.number()`.
 * - `cloud_server_en` is the one field that's a genuine JSON `boolean`
 *   rather than a 0/1 number — that's an inconsistency in the device API
 *   itself, not a transcription error here.
 * - `devpassword` is included as `z.string()` but is sensitive (looks like
 *   an encrypted/encoded credential) — worth scrubbing before logging any
 *   parsed response that contains it.
 * - `sg*` fields (`sgconn`, `sgtype`, `sgid`, `sgrsp`, and the encoder/
 *   decoder `sgen`/`sgbr`/`sgbs`/`sgpa`/`sgsb`) — meaning unconfirmed, typed
 *   conservatively (numbers/strings) without assuming semantics.
 * - The decoder (`out`) fields `vsel`/`asel`/`rsel`/`ssel`/`usel`/`csel`/
 *   `msel` and `vfr`/`afr`/`rfr`/`sfr`/`ufr`/`cfr` appear to track, per
 *   signal type, the routing state driven by `SET DEC [dec] SWITCH [enc]
 *   <type>` (see `decoder-control.ts`) — the `*sel` fields likely hold the
 *   currently-routed encoder id, and the `*fr` fields likely mirror
 *   follow-mode (`enc=0`) for that signal type. The exact letter-to-type
 *   mapping is unconfirmed (the switch types are ALL/VIDEO/AUDIO/IR/RS232/
 *   USB/CEC/MEDIA, which doesn't cleanly cover both the `r` and `s`
 *   prefixes seen here), so these are left as plain numbers/flags without
 *   asserting which signal type each belongs to.
 * - `color` is a `z.string()` on the encoder (`in`) object but a
 *   `z.number()` on the decoder (`out`) object — that's an inconsistency in
 *   the device API itself, not a transcription error here.
 * - `usbdata` (decoder only) was observed as the string `"gray"`, not the
 *   `ON`/`OFF` value the `SET DEC [dec] USB DATA` action writes — it looks
 *   like a separate state string, not an echo of the last-written value.
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

// Per-encoder status, one entry per item in the top-level `in` array.
const EncoderStatusSchema = z.object({
	domainid: z.number(),
	id: z.number(),
	name: z.string(),
	time: z.tuple([z.number(), z.number(), z.number()]), // shape/meaning unconfirmed — possibly elapsed uptime [d, h, m]
	state: z.string(), // state machine id, e.g. "s_attaching" — full enum unconfirmed
	ol: zBinaryFlag, // presumed "online"
	active: zBinaryFlag,
	network: zBinaryFlag,
	ver: z.string(),
	model: z.string(),
	hw_mode: z.string(),
	sw_mode: z.string(),
	devtype: z.string(), // e.g. "TAV-CHAZYUSB-TX" — the "-TX" suffix confirms `in` = encoders/transmitters
	auth: z.number(), // meaning/range unconfirmed
	remainday: z.number(), // likely trial/license days remaining
	UID: z.string(),
	flash_size: z.number(),
	board_revision: z.number(),
	dante_en: zBinaryFlag,
	multicast: zBinaryFlag,
	bridge: zBinaryFlag,
	mcu_ver: z.string(),
	im: z.number(), // likely an IP mode, cf. netsta's `*ipmode` fields — not confirmed binary
	ip: z.string(),
	gw: z.string(),
	sm: z.string(),
	mac: z.string(),
	dvlan: zBinaryFlag,
	dvtag: zBinaryFlag,
	lan2_im: z.number(), // see `im`
	lan2_ip: z.string(),
	lan2_gw: z.string(),
	lan2_sm: z.string(),
	asel: z.number(), // meaning unconfirmed — possibly audio source select
	afr: z.number(), // meaning unconfirmed — the same name recurs in the decoder object as part of a per-signal follow-mode group, but not confirmed to mean the same thing here
	license: zBinaryFlag,
	em: z.number(), // meaning unconfirmed
	ei: z.number(), // meaning unconfirmed
	edidmax: z.number(),
	resolution: z.string(),
	color: z.string(), // string here; the decoder's equivalent field is a number — see file header note
	depth: z.string(),
	hdcp: z.string(),
	aud: zBinaryFlag,
	audstream: z.number(), // meaning unconfirmed
	sig: zBinaryFlag, // likely "signal present"
	conn: z.string(), // e.g. "HDMI:0"
	arccap: zBinaryFlag, // ARC capability
	discec: zBinaryFlag, // likely "disable CEC" toggle
	isp: z.number(), // meaning unconfirmed
	led: zBinaryFlag,
	fplock: zBinaryFlag, // front panel lock
	sgen: z.number(),
	sgbr: z.number(),
	sgbs: z.number(),
	sgpa: z.number(),
	sgsb: z.number(),
	profile: z.number(),
	usb: z.number(), // meaning unconfirmed
	udatamode: z.number(),
	vsrc: z.number(), // meaning unconfirmed — possibly video source select
	vauto: zBinaryFlag, // meaning unconfirmed — likely an "auto video" toggle
	fan: z.number(), // likely a fan speed percentage (observed 100)
	lanmode: z.number(),
	irmode: z.number(),
	ircable: zBinaryFlag,
	netmode: z.number(),
	arcmode: z.number(),
	iovoltage: z.number(), // observed 12 — likely volts
	io1dir: z.number(),
	io2dir: z.number(),
	io1: z.number(),
	io2: z.number(),
	relay1: z.number(),
	relay2: z.number(),
	ssenable: zBinaryFlag, // stream-server enable
	ssmainurl: z.string(),
	ssmainenctype: z.string(),
	ssmainbitrate: z.string(),
	ssmainfps: z.string(),
	ssmaingop: z.string(),
	ssmainprofile: z.string(),
	ssmainrcmode: z.string(),
	ssmainres: z.string(),
	sssuburl: z.string(),
	sssubenctype: z.string(),
	sssubbitrate: z.string(),
	sssubfps: z.string(),
	sssubgop: z.string(),
	sssubprofile: z.string(),
	sssubrcmode: z.string(),
	sssubres: z.string(),
	ssgateway: z.string(),
	ssip: z.string(),
	ssmask: z.string(),
	ssipmode: z.string(), // sic — string here, unlike the numeric `*ipmode` fields in netsta
	ssmac: z.string(),
	ssversion: z.string(),
	ssworkmode: z.string(),
	ssvlan: z.number(),
})

// Per-decoder status, one entry per item in the top-level `out` array.
const DecoderStatusSchema = z.object({
	domainid: z.number(),
	id: z.number(),
	name: z.string(),
	time: z.tuple([z.number(), z.number(), z.number()]), // see EncoderStatusSchema's `time`
	state: z.string(), // e.g. "s_srv_on" — full enum unconfirmed
	ol: zBinaryFlag,
	active: zBinaryFlag,
	network: zBinaryFlag,
	ver: z.string(),
	model: z.string(),
	hw_mode: z.string(),
	sw_mode: z.string(),
	devtype: z.string(), // e.g. "TAV-CHAZY4K-RX" — the "-RX" suffix confirms `out` = decoders/receivers
	auth: z.number(),
	remainday: z.number(),
	UID: z.string(),
	flash_size: z.number(),
	dante_en: zBinaryFlag,
	multicast: zBinaryFlag,
	ull: zBinaryFlag, // likely "ultra-low-latency" enable
	bridge: zBinaryFlag,
	das: z.number(), // meaning unconfirmed
	mcu_ver: z.string(),
	im: z.number(), // see EncoderStatusSchema's `im`
	ip: z.string(),
	gw: z.string(),
	sm: z.string(),
	mac: z.string(),
	dvlan: zBinaryFlag,
	dvtag: zBinaryFlag,
	lan2_im: z.number(),
	lan2_ip: z.string(),
	lan2_gw: z.string(),
	lan2_sm: z.string(),
	fr: z.number(), // meaning unconfirmed — likely unrelated to the per-signal vfr/afr/etc. group below, since `SWITCH ... ALL` documents a different enc=0 behavior ("no source") than the per-type switches ("follow mode")
	// See the file header note on the *sel/*fr family — these track per-signal-type routing state
	// driven by `SET DEC [dec] SWITCH [enc] <type>`.
	vsel: z.number(),
	asel: z.number(),
	rsel: z.number(),
	ssel: z.number(),
	usel: z.number(),
	csel: z.number(),
	msel: z.number(),
	vfr: zBinaryFlag,
	afr: zBinaryFlag,
	rfr: zBinaryFlag,
	sfr: zBinaryFlag,
	ufr: zBinaryFlag,
	cfr: zBinaryFlag,
	vwen: zBinaryFlag, // likely "video wall enable"
	om: z.number(), // meaning unconfirmed
	sig: zBinaryFlag, // likely "signal present", cf. EncoderStatusSchema's `sig`
	conn: z.string(),
	snkinfospt: zBinaryFlag, // likely "sink info support"
	preferred: z.string(),
	hdcpcap: z.string(), // empty string in the observed sample — presumably reports HDCP capability/version as text
	arccap: zBinaryFlag,
	earcen: zBinaryFlag, // eARC enable
	vw: zBinaryFlag, // per-decoder video-wall membership flag — unrelated to the top-level `vw` array
	hdr: zBinaryFlag,
	vwrow: z.number(),
	vwcolumn: z.number(),
	vwhpos: z.number(),
	vwvpos: z.number(),
	rotate: z.number(),
	res: z.number(), // resolution index, cf. `resmax`
	resmax: z.number(),
	hactive: z.number(),
	hfp: z.number(),
	hsync: z.number(),
	hbp: z.number(),
	htotal: z.number(),
	vactive: z.number(),
	vfp: z.number(),
	vsync: z.number(),
	vbp: z.number(),
	vtotal: z.number(),
	refresh: z.number(),
	color: z.number(), // number here; the encoder's equivalent field is a string — see file header note
	hpolarity: z.number(),
	vpolarity: z.number(),
	dclk: z.number(),
	dclk_ntsc: z.number(),
	colorspace: z.number(),
	csspt: zBinaryFlag, // likely a support/capability flag
	discec: zBinaryFlag,
	osp: z.number(), // meaning unconfirmed
	txout: zBinaryFlag,
	black: zBinaryFlag, // likely "black screen" toggle
	pause: zBinaryFlag,
	autoon: zBinaryFlag,
	led: zBinaryFlag,
	fplock: zBinaryFlag,
	sgen: z.number(),
	sgbr: z.number(),
	sgbs: z.number(),
	sgpa: z.number(),
	sgsb: z.number(),
	lanmode: z.number(),
	irmode: z.number(),
	ircable: zBinaryFlag,
	netmode: z.number(),
	arcmode: z.number(),
	iovoltage: z.number(),
	io1dir: z.number(),
	io2dir: z.number(),
	io1: z.number(),
	io2: z.number(),
	relay1: z.number(),
	relay2: z.number(),
	opten: zBinaryFlag, // meaning unconfirmed — likely an enable toggle given the "-en" suffix
	osd: zBinaryFlag,
	osdcolor: z.number(),
	osdinfo: zBinaryFlag,
	usboip: zBinaryFlag, // likely "USB over IP" enable
	udatamode: z.number(),
	usbdata: z.string(), // e.g. "gray" — see file header note
	audstream: z.number(),
	license: zBinaryFlag,
	hotkey: z.array(z.unknown()), // shape unconfirmed — always empty in observed samples
	ssmainurl: z.string(),
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
	docver: z.int(),
	syssta: SysStaSchema,
	netsta: NetStaSchema,
	in: z.array(EncoderStatusSchema),
	out: z.array(DecoderStatusSchema),
	config: ConfigSchema,
	groups: z.array(z.unknown()), // shape unconfirmed
	medias: z.array(z.unknown()), // shape unconfirmed
	vw: z.array(VideoWallSchema),
})

export type ChazyMxStaResponse = z.infer<typeof ChazyMxStaResponseSchema>
export type SysSta = z.infer<typeof SysStaSchema>
export type NetSta = z.infer<typeof NetStaSchema>
export type EncoderStatus = z.infer<typeof EncoderStatusSchema>
export type DecoderStatus = z.infer<typeof DecoderStatusSchema>
export type VideoWall = z.infer<typeof VideoWallSchema>
