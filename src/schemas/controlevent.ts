import { z } from 'zod'

/**
 * Chazy Control – Control event list response schema (`getjson.cgi` — `controlevent` section)
 *
 * Notes:
 * - `type` mirrors the numeric form of `EVENT_TYPES` in `api.ts` (IR=1,
 *   RS232=2, CEC=3, TCP=4, UDP=5, HTTP_GET=6, HTTP_POST=7, HTTPS_GET=8,
 *   HTTPS_POST=9) — the device reports it as a plain number here, unlike
 *   the zero-padded string code (`'04'`, `'05'`, ...) used when setting it
 *   via `SET EVENT [hdl] TYPE [type]`.
 * - `hex_data` is validated against the same space-separated hex-byte-pair
 *   format as the `SET EVENT [hdl] DATA HEX [data]` action, but allowing
 *   empty — an event using `ascii_data` instead leaves this blank.
 * - `port` and `device` were only observed as small integers (0/1) —
 *   meaning unconfirmed. `port` doesn't look like a real TCP/UDP port
 *   number at those values, so it may actually correspond to the `dev`
 *   (CLAN/VLAN) option on `SET EVENT [hdl] ADDR [addr] PORT [port] DEV
 *   [dev]` rather than a literal port; not confirmed either way.
 * - `resend` — meaning unconfirmed, possibly a resend count or a resend
 *   enable flag (cf. `resend_delay`, which matches `SET EVENT [hdl] RESEND
 *   DELAY [dly]`).
 * - `response` — presumably holds the last reply body for a
 *   request/response-style event; always empty in observed samples.
 */

const HEX_DATA_FORMAT = /^([0-9A-Fa-f]{2}(\s[0-9A-Fa-f]{2})*)?$/

const EventTypeCode = z.union([
	z.literal(1), // IR
	z.literal(2), // RS232
	z.literal(3), // CEC
	z.literal(4), // TCP
	z.literal(5), // UDP
	z.literal(6), // HTTP_GET
	z.literal(7), // HTTP_POST
	z.literal(8), // HTTPS_GET
	z.literal(9), // HTTPS_POST
])

const ControlEventSchema = z.object({
	id: z.number(),
	name: z.string(),
	type: EventTypeCode,
	addr: z.string(),
	port: z.number(), // meaning unconfirmed — see file header note
	device: z.number(), // meaning unconfirmed
	hex_data: z.string().regex(HEX_DATA_FORMAT, 'Expected space-separated hex byte pairs, or empty'),
	ascii_data: z.string(),
	params: z.string(),
	request_url: z.string(),
	resend_delay: z.number(),
	resend: z.number(), // meaning unconfirmed — see file header note
	response: z.string(),
})

export const ChazyControlEventResponseSchema = z.compile(
	z.object({
		events: z.array(ControlEventSchema),
	}),
)

export type ChazyControlEventResponse = z.infer<typeof ChazyControlEventResponseSchema>
export type ControlEvent = z.infer<typeof ControlEventSchema>
