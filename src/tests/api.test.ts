import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type ModuleInstance from '../main.js'
import type { Message } from '../types.js'
import ChazyControl, { assertValidIPv4, EVENT_TYPES } from '../api.js'
import { ChazyMxStaResponseSchema } from '../schemas/mxsta.js'

vi.mock('../utils/image.js', () => ({
	jpegBufferToPng64: vi.fn((buffer: Buffer) => `data:image/png;base64,mock(${buffer.toString('hex')})`),
}))

// #pollOnce chains several sequential real `await`s (one per status query); under fake timers
// those settle via microtasks rather than timers, so draining a batch of them is the reliable
// way to let a full poll cycle complete before asserting on it.
async function flushMicrotasks(times = 20): Promise<void> {
	for (let i = 0; i < times; i++) {
		await Promise.resolve()
	}
}

function createMockInstance() {
	const sendMsg = vi.fn<(msg: Message, signal?: AbortSignal) => Promise<unknown>>()
	const checkFeedbacksById = vi.fn<(...feedbackIds: string[]) => void>()
	const instance = { sendMsg, checkFeedbacksById } as unknown as ModuleInstance
	return { instance, sendMsg, checkFeedbacksById }
}

const VALID_DANTE_RESPONSE = {
	docver: 1,
	controller: { vip: '169.254.8.100', vsm: '255.255.0.0' },
	ddm: { server: '', port: 0, state: '', current_domain: '', domains: [] },
	dante: [],
}

const VALID_DANTE_PRESET_RESPONSE = { dante_preset: [] }

const VALID_TIME_RESPONSE = { docver: 1, time: '1970/01/05 02:09:27', tz: '' }

const VALID_CONTROL_EVENT_RESPONSE = { events: [] }

const VALID_CONTROL_EVENT_LOG_RESPONSE = { events_log: [] }

// One full valid syssta/netsta pair, reused across mxsta tests — `in`/`out`/`groups`/`medias`/`vw`
// are all fine left empty since z.array() accepts zero elements regardless of item shape.
const VALID_MXSTA_RESPONSE = {
	docver: 504,
	syssta: {
		devname: 'Controller(DA)',
		time: '1970/01/05 02:09:27',
		tz: '',
		softver: '1.10.17',
		ir: 1,
		rs232: 1,
		iodir: 0,
		ioset: 15,
		ioget: 15,
		busy: 0,
		devuser: 'admin',
		devpassword: 'wHGeEs3hMAXuViE7lSl/YQ==',
		sgconn: 0,
		sgtype: 0,
		sgid: 0,
		sgrsp: '',
		uuid: '',
		sip: '',
		domainid: 0,
		verify: 0,
		verifyinfo: '',
		dnsname: 'controller',
		dantevalid: 1,
		cloud: 0,
		timezone: '',
		zonename: '',
		ntpserver: '',
		cloud_server_en: false,
		cloud_server_addr: '',
		cloud_server_port: 0,
		cloud_server_lan: 0,
		cloud_server_conn: 0,
		cloud_server_code: 0,
	},
	netsta: {
		cdhcp: 1,
		cip: '192.168.6.100',
		cgw: '192.168.6.1',
		csm: '255.255.255.0',
		cmac: '18:66:96:11:03:FF',
		vdhcp: 1,
		vip: '169.254.8.100',
		vgw: '0.0.0.0',
		vsm: '255.255.0.0',
		vmac: '18:66:96:11:03:FE',
		dns_mode: 0,
		dns_prefer: '0.0.0.0',
		dns_backup: '0.0.0.0',
		dns_port: 0,
		enc_preset_ipmode: 1,
		enc_preset_ip_min: '169.254.10.1',
		enc_preset_ip_max: '169.254.13.254',
		enc_preset_netmask: '255.255.0.0',
		enc_preset_gateway: '169.254.10.1',
		dec_preset_ipmode: 1,
		dec_preset_ip_min: '169.254.20.1',
		dec_preset_ip_max: '169.254.23.254',
		dec_preset_netmask: '255.255.0.0',
		dec_preset_gateway: '169.254.20.1',
		ipmode: 1,
		txipbegain: '169.254.10.1',
		txipend: '169.254.13.254',
		rxipbegain: '169.254.20.1',
		rxipend: '169.254.23.254',
		https: 0,
		tnenable: 1,
		sshenable: 0,
		telnet: 23,
		ssh: 22,
	},
	in: [],
	out: [],
	config: { cfg: [] },
	groups: [],
	medias: [],
	vw: [],
}

// VALID_MXSTA_RESPONSE is wire-format JSON (0/1 flags), used to mock sendMsg's raw response.
// zBinaryFlag fields transform to real booleans on parse, so assertions against the parsed
// getter output compare against this derived value instead of the raw literal above.
const VALID_MXSTA_PARSED = ChazyMxStaResponseSchema.parse(VALID_MXSTA_RESPONSE)

type SendMsgMock = ReturnType<typeof vi.fn<(msg: Message, signal?: AbortSignal) => Promise<unknown>>>

function mockAllStatusQueries(sendMsg: SendMsgMock): void {
	sendMsg.mockImplementation(async (msg) => {
		if (msg.method === 'capture') throw new Error('Unexpected capture request')
		switch (msg.data) {
			case 'dante':
				return VALID_DANTE_RESPONSE
			case 'dantepreset':
				return VALID_DANTE_PRESET_RESPONSE
			case 'mxsta':
				return VALID_MXSTA_RESPONSE
			case 'time':
				return VALID_TIME_RESPONSE
			case 'controlevent':
				return VALID_CONTROL_EVENT_RESPONSE
			case 'controleventlog':
				return VALID_CONTROL_EVENT_LOG_RESPONSE
			default:
				throw new Error(`Unexpected query: ${msg.data}`)
		}
	})
}

describe('assertValidIPv4', () => {
	it.each(['169.254.8.100', '0.0.0.0', '255.255.255.255', '1.2.3.4'])('accepts %s', (ip) => {
		expect(() => assertValidIPv4(ip, 'ip')).not.toThrow()
	})

	it.each(['256.1.1.1', '1.2.3', '1.2.3.4.5', 'not-an-ip', '1.2.3.-1', ''])('rejects %s', (ip) => {
		expect(() => assertValidIPv4(ip, 'ip')).toThrow(/Invalid ip/)
	})
})

describe('ChazyControl static command builders', () => {
	describe('Device Management', () => {
		it('search', () => {
			expect(ChazyControl.search()).toEqual({ data: 'SEARCH', method: 'submit' })
		})

		it('getSearchStatus', () => {
			expect(ChazyControl.getSearchStatus()).toEqual({ data: 'GET SEARCH STATUS', method: 'submit' })
		})

		it('searchReset', () => {
			expect(ChazyControl.searchReset()).toEqual({ data: 'SEARCH RESET', method: 'submit' })
		})

		it('addDeviceEncoder', () => {
			expect(ChazyControl.addDeviceEncoder(3, 12)).toEqual({ data: 'ADD DEV 3 ENC 12', method: 'submit' })
		})

		it('addDeviceEncoder rejects a non-positive index', () => {
			expect(() => ChazyControl.addDeviceEncoder(0, 12)).toThrow(/Invalid search list index/)
		})

		it('addDeviceDecoder', () => {
			expect(ChazyControl.addDeviceDecoder(3, 12)).toEqual({ data: 'ADD DEV 3 DEC 12', method: 'submit' })
		})

		it('addDeviceDecoder rejects a non-positive decoder', () => {
			expect(() => ChazyControl.addDeviceDecoder(3, 0)).toThrow(/Invalid decoder/)
		})

		it('addDeviceReset', () => {
			expect(ChazyControl.addDeviceReset()).toEqual({ data: 'ADD DEV RESET', method: 'submit' })
		})

		it('addAutoAll', () => {
			expect(ChazyControl.addAutoAll()).toEqual({ data: 'ADD AUTO ALL', method: 'submit' })
		})
	})

	describe('Decoder Control', () => {
		it('switchDecoder', () => {
			expect(ChazyControl.switchDecoder(1, 2, 'VIDEO')).toEqual({
				data: 'SET DEC 1 SWITCH 2 VIDEO',
				method: 'submit',
			})
		})

		it('switchDecoder allows enc=0 (no source / follow mode)', () => {
			expect(ChazyControl.switchDecoder(1, 0, 'ALL')).toEqual({ data: 'SET DEC 1 SWITCH 0 ALL', method: 'submit' })
		})

		it('switchDecoder rejects an out-of-range decoder', () => {
			expect(() => ChazyControl.switchDecoder(0, 0, 'ALL')).toThrow(/Invalid decoder/)
			expect(() => ChazyControl.switchDecoder(1000, 0, 'ALL')).toThrow(/Invalid decoder/)
		})

		it('switchDecoder rejects a negative encoder', () => {
			expect(() => ChazyControl.switchDecoder(1, -1, 'ALL')).toThrow(/Invalid encoder/)
		})

		it('setDecoderUsbData', () => {
			expect(ChazyControl.setDecoderUsbData(4, 'ON')).toEqual({ data: 'SET DEC 4 USB DATA ON', method: 'submit' })
		})

		it('setDecoderUsbData rejects an invalid decoder', () => {
			expect(() => ChazyControl.setDecoderUsbData(0, 'OFF')).toThrow(/Invalid decoder/)
		})
	})

	describe('Status queries', () => {
		it('getDanteDevices', () => {
			expect(ChazyControl.getDanteDevices()).toEqual({ data: 'dante', method: 'get' })
		})

		it('getDantePresets', () => {
			expect(ChazyControl.getDantePresets()).toEqual({ data: 'dantepreset', method: 'get' })
		})

		it('getMxSta', () => {
			expect(ChazyControl.getMxSta()).toEqual({ data: 'mxsta', method: 'get' })
		})

		it('getTime', () => {
			expect(ChazyControl.getTime()).toEqual({ data: 'time', method: 'get' })
		})

		it('getControlEvents', () => {
			expect(ChazyControl.getControlEvents()).toEqual({ data: 'controlevent', method: 'get' })
		})

		it('getControlEventLog', () => {
			expect(ChazyControl.getControlEventLog()).toEqual({ data: 'controleventlog', method: 'get' })
		})
	})

	describe('Dante Control', () => {
		it('setDanteName', () => {
			expect(ChazyControl.setDanteName('Encoder 001', 'New Name')).toEqual({
				data: 'SET DANTE DEV Encoder 001 NAME New Name',
				method: 'submit',
			})
		})

		it('setDanteName trims a name that exceeds 31 characters', () => {
			const msg = ChazyControl.setDanteName('this-name-is-way-too-long-for-the-device-to-accept', 'x')
			expect(msg.data).toBe('SET DANTE DEV this-name-is-way-too-long-for-t NAME x')
		})

		it('setDanteName rejects a name starting or ending with a hyphen', () => {
			expect(() => ChazyControl.setDanteName('-bad', 'ok')).toThrow(/Invalid name/)
			expect(() => ChazyControl.setDanteName('ok', 'bad-')).toThrow(/Invalid name/)
		})

		it('setDanteSampleRate', () => {
			expect(ChazyControl.setDanteSampleRate('Encoder 001', '48000')).toEqual({
				data: 'SET DANTE DEV Encoder 001 SRATE 48000',
				method: 'submit',
			})
		})

		it('setDanteEncoding', () => {
			expect(ChazyControl.setDanteEncoding('Encoder 001', 'PCM24')).toEqual({
				data: 'SET DANTE DEV Encoder 001 ENC PCM24',
				method: 'submit',
			})
		})

		it('setDanteTxChannelName', () => {
			expect(ChazyControl.setDanteTxChannelName('Encoder 001', 'AUDIO', 1, 'Mic 1')).toEqual({
				data: 'SET DANTE DEV Encoder 001 AUDIO TXCHN 1 NAME Mic 1',
				method: 'submit',
			})
		})

		it('setDanteTxChannelName rejects a non-positive channel', () => {
			expect(() => ChazyControl.setDanteTxChannelName('Encoder 001', 'AUDIO', 0, 'Mic 1')).toThrow(/Invalid channel/)
		})

		it('addDanteTransmitFlow', () => {
			expect(ChazyControl.addDanteTransmitFlow('Encoder 001', 'AUDIO', 'Flow 1', 1, '1:2:3')).toEqual({
				data: 'SET DANTE DEV Encoder 001 AUDIO TXFLOW Flow 1 ID 1 SLOT 1:2:3',
				method: 'submit',
			})
		})

		it('addDanteTransmitFlow rejects an invalid channel slot list', () => {
			expect(() => ChazyControl.addDanteTransmitFlow('Encoder 001', 'AUDIO', 'Flow 1', 1, '1:0:3')).toThrow(
				/Invalid channel slot list/,
			)
		})

		it('deleteDanteTransmitFlow', () => {
			expect(ChazyControl.deleteDanteTransmitFlow('Encoder 001', 'VIDEO', 2)).toEqual({
				data: 'SET DANTE DEV Encoder 001 VIDEO TXFLOW 2 DELETE',
				method: 'submit',
			})
		})

		it('setDanteRxChannelName', () => {
			expect(ChazyControl.setDanteRxChannelName('Decoder 001', 'AUDIO', 1, 'Speaker 1')).toEqual({
				data: 'SET DANTE DEV Decoder 001 AUDIO RXCHN 1 NAME Speaker 1',
				method: 'submit',
			})
		})

		it('setDanteSubscription', () => {
			expect(ChazyControl.setDanteSubscription('Decoder 001', 1, 'AUDIO', 'Encoder 001', 2)).toEqual({
				data: 'SET DANTE DEV Decoder 001 AUDIO RXCHN 1 SOURCE Encoder 001 CHN 2',
				method: 'submit',
			})
		})

		it('setDanteSubscription allows txChan=0 to remove a subscription', () => {
			expect(ChazyControl.setDanteSubscription('Decoder 001', 1, 'AUDIO', 'Encoder 001', 0)).toEqual({
				data: 'SET DANTE DEV Decoder 001 AUDIO RXCHN 1 SOURCE Encoder 001 CHN 0',
				method: 'submit',
			})
		})

		it('setDanteSubscription rejects a negative channel', () => {
			expect(() => ChazyControl.setDanteSubscription('Decoder 001', -1, 'AUDIO', 'Encoder 001', 0)).toThrow(
				/Invalid channel/,
			)
		})

		it('setDanteLatency', () => {
			expect(ChazyControl.setDanteLatency('Encoder 001', '5')).toEqual({
				data: 'SET DANTE DEV Encoder 001 LATENCY 5',
				method: 'submit',
			})
		})

		it('setDantePreferred', () => {
			expect(ChazyControl.setDantePreferred('Encoder 001', 'ON')).toEqual({
				data: 'SET DANTE DEV Encoder 001 PREFERRED ON',
				method: 'submit',
			})
		})

		it('setDanteAes67', () => {
			expect(ChazyControl.setDanteAes67('Encoder 001', 'OFF')).toEqual({
				data: 'SET DANTE DEV Encoder 001 AES67 OFF',
				method: 'submit',
			})
		})

		it('setDanteAes67Prefix', () => {
			expect(ChazyControl.setDanteAes67Prefix('Encoder 001', 100)).toEqual({
				data: 'SET DANTE DEV Encoder 001 AES67 PREFIX 100',
				method: 'submit',
			})
		})

		it('setDanteAes67Prefix rejects an out-of-range prefix', () => {
			expect(() => ChazyControl.setDanteAes67Prefix('Encoder 001', 256)).toThrow(/Invalid AES67 prefix/)
		})

		it('clearDanteConfig', () => {
			expect(ChazyControl.clearDanteConfig('Encoder 001', 'KEEPIP')).toEqual({
				data: 'SET DANTE DEV Encoder 001 CLEAR CONFIG KEEPIP',
				method: 'submit',
			})
		})

		it('setDanteStaticIp', () => {
			expect(
				ChazyControl.setDanteStaticIp('Encoder 001', 1, '169.254.10.5', '255.255.0.0', '169.254.0.1', '8.8.8.8'),
			).toEqual({
				data: 'SET DANTE DEV Encoder 001 INTERFACE 1 STATIC IP 169.254.10.5 MASK 255.255.0.0 GW 169.254.0.1 DNS 8.8.8.8',
				method: 'submit',
			})
		})

		it('setDanteStaticIp rejects an invalid ip', () => {
			expect(() =>
				ChazyControl.setDanteStaticIp('Encoder 001', 1, 'not-an-ip', '255.255.0.0', '169.254.0.1', '8.8.8.8'),
			).toThrow(/Invalid ip address/)
		})

		it('setDanteDynamicIp', () => {
			expect(ChazyControl.setDanteDynamicIp('Encoder 001', 2)).toEqual({
				data: 'SET DANTE DEV Encoder 001 INTERFACE 2 DYNAMIC',
				method: 'submit',
			})
		})

		it('rebootDanteDevice', () => {
			expect(ChazyControl.rebootDanteDevice('Encoder 001', 'FACTORY')).toEqual({
				data: 'SET DANTE DEV Encoder 001 REBOOT FACTORY',
				method: 'submit',
			})
		})

		it('clearDanteEvents', () => {
			expect(ChazyControl.clearDanteEvents()).toEqual({ data: 'SET DANTE EVENT CLEAR', method: 'submit' })
		})

		it('getDanteDeviceStatus', () => {
			expect(ChazyControl.getDanteDeviceStatus('Encoder 001')).toEqual({
				data: 'GET DANTE DEV Encoder 001 STATUS',
				method: 'submit',
			})
		})

		it('danteDeviceSearch', () => {
			expect(ChazyControl.danteDeviceSearch()).toEqual({ data: 'DANTE DEV SEARCH', method: 'submit' })
		})
	})

	describe('Dante Preset Control', () => {
		it('createDantePreset', () => {
			expect(ChazyControl.createDantePreset(1)).toEqual({ data: 'CREATE DANTE PRESET HANDLE 1', method: 'submit' })
		})

		it('deleteDantePreset', () => {
			expect(ChazyControl.deleteDantePreset(1)).toEqual({ data: 'DELETE DANTE PRESET HANDLE 1', method: 'submit' })
		})

		it('setDantePresetName', () => {
			expect(ChazyControl.setDantePresetName(1, 'My Preset')).toEqual({
				data: 'SET DANTE PRESET 1 NAME My Preset',
				method: 'submit',
			})
		})

		it('setDantePresetName rejects an empty name', () => {
			expect(() => ChazyControl.setDantePresetName(1, '')).toThrow(/Invalid dante preset name/)
		})

		it('applyDantePreset', () => {
			expect(ChazyControl.applyDantePreset(1)).toEqual({ data: 'APPLY DANTE PRESET 1', method: 'submit' })
		})

		it('getDantePresetStatus', () => {
			expect(ChazyControl.getDantePresetStatus(1)).toEqual({ data: 'GET DANTE PRESET 1 STATUS', method: 'submit' })
		})

		it('rejects an out-of-range handle', () => {
			expect(() => ChazyControl.createDantePreset(0)).toThrow(/Invalid dante preset handle/)
			expect(() => ChazyControl.createDantePreset(257)).toThrow(/Invalid dante preset handle/)
		})
	})

	describe('Event Control', () => {
		it('createEvent', () => {
			expect(ChazyControl.createEvent(1)).toEqual({ data: 'CREATE EVENT HANDLE 1', method: 'submit' })
		})

		it('deleteEvent', () => {
			expect(ChazyControl.deleteEvent(1)).toEqual({ data: 'DELETE EVENT HANDLE 1', method: 'submit' })
		})

		it('setEventName', () => {
			expect(ChazyControl.setEventName(1, 'on')).toEqual({ data: 'SET EVENT 1 NAME on', method: 'submit' })
		})

		it.each(Object.entries(EVENT_TYPES))('setEventType maps %s to its device code', (type, code) => {
			expect(ChazyControl.setEventType(1, type as keyof typeof EVENT_TYPES)).toEqual({
				data: `SET EVENT 1 TYPE ${code}`,
				method: 'submit',
			})
		})

		it('setEventAddress', () => {
			expect(ChazyControl.setEventAddress(1, '10.1.1.5')).toEqual({
				data: 'SET EVENT 1 ADDR 10.1.1.5',
				method: 'submit',
			})
		})

		it('setEventAddress rejects an invalid address', () => {
			expect(() => ChazyControl.setEventAddress(1, 'not-an-ip')).toThrow(/Invalid event address/)
		})

		it('setEventAddressWithPort', () => {
			expect(ChazyControl.setEventAddressWithPort(1, '10.1.1.5', 80, 'CLAN')).toEqual({
				data: 'SET EVENT 1 ADDR 10.1.1.5 PORT 80 DEV CLAN',
				method: 'submit',
			})
		})

		it('setEventAddressWithPort rejects an out-of-range port', () => {
			expect(() => ChazyControl.setEventAddressWithPort(1, '10.1.1.5', 0, 'CLAN')).toThrow(/Invalid event port/)
		})

		it('setEventDataAscii', () => {
			expect(ChazyControl.setEventDataAscii(1, 'turn on please')).toEqual({
				data: 'SET EVENT 1 DATA turn on please',
				method: 'submit',
			})
		})

		it('setEventDataHex', () => {
			expect(ChazyControl.setEventDataHex(1, '74 75 72 6E')).toEqual({
				data: 'SET EVENT 1 DATA HEX 74 75 72 6E',
				method: 'submit',
			})
		})

		it('setEventDataHex rejects malformed hex', () => {
			expect(() => ChazyControl.setEventDataHex(1, 'zz')).toThrow(/Invalid event data/)
		})

		it('setEventParams', () => {
			expect(ChazyControl.setEventParams(1, 'a=1')).toEqual({ data: 'SET EVENT 1 PARAMS a=1', method: 'submit' })
		})

		it('setEventRequest', () => {
			expect(ChazyControl.setEventRequest(1, 'GET /')).toEqual({
				data: 'SET EVENT 1 REQUEST GET /',
				method: 'submit',
			})
		})

		it('setEventResendDelay', () => {
			expect(ChazyControl.setEventResendDelay(1, 5)).toEqual({
				data: 'SET EVENT 1 RESEND DELAY 5',
				method: 'submit',
			})
		})

		it('setEventResendDelay rejects an out-of-range delay', () => {
			expect(() => ChazyControl.setEventResendDelay(1, 101)).toThrow(/Invalid event resend delay/)
		})

		it('startEvent', () => {
			expect(ChazyControl.startEvent(1)).toEqual({ data: 'SET EVENT 1 START', method: 'submit' })
		})

		it('stopEvent', () => {
			expect(ChazyControl.stopEvent(1)).toEqual({ data: 'SET EVENT 1 STOP', method: 'submit' })
		})

		it('getEventStatus', () => {
			expect(ChazyControl.getEventStatus()).toEqual({ data: 'GET EVENT STATUS', method: 'submit' })
		})
	})
})

describe('ChazyControl polling', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it('populates every status getter from a single poll cycle', async () => {
		const { instance, sendMsg } = createMockInstance()
		mockAllStatusQueries(sendMsg)
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		chazyControl.startPolling()
		await vi.waitFor(() => expect(chazyControl.mxsta).not.toBeNull())

		expect(chazyControl.dantePresets).toEqual(VALID_DANTE_PRESET_RESPONSE)
		expect(chazyControl.mxsta).toEqual(VALID_MXSTA_PARSED)
		expect(chazyControl.time).toEqual(VALID_TIME_RESPONSE)
		expect(chazyControl.controlEvents).toEqual(VALID_CONTROL_EVENT_RESPONSE)
		expect(chazyControl.controlEventLog).toEqual(VALID_CONTROL_EVENT_LOG_RESPONSE)
		expect(chazyControl.getDanteDeviceChoices()).toEqual([])
	})

	it('does not start polling once the signal is already aborted', async () => {
		const { instance, sendMsg } = createMockInstance()
		mockAllStatusQueries(sendMsg)
		const controller = new AbortController()
		controller.abort()
		const chazyControl = new ChazyControl(instance, 5000, 5000, controller.signal)

		chazyControl.startPolling()
		await new Promise((resolve) => setTimeout(resolve, 10))

		expect(sendMsg).not.toHaveBeenCalled()
		expect(chazyControl.mxsta).toBeNull()
	})

	it('keeps polling the other queries when one query fails to fetch', async () => {
		const { instance, sendMsg } = createMockInstance()
		sendMsg.mockImplementation(async (msg) => {
			if (msg.method === 'capture') throw new Error('Unexpected capture request')
			if (msg.data === 'mxsta') throw new Error('device unreachable')
			return {
				dante: VALID_DANTE_RESPONSE,
				dantepreset: VALID_DANTE_PRESET_RESPONSE,
				time: VALID_TIME_RESPONSE,
				controlevent: VALID_CONTROL_EVENT_RESPONSE,
				controleventlog: VALID_CONTROL_EVENT_LOG_RESPONSE,
			}[msg.data]
		})
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		chazyControl.startPolling()
		await vi.waitFor(() => expect(chazyControl.time).not.toBeNull())

		expect(chazyControl.mxsta).toBeNull() // the failed query
		expect(chazyControl.dantePresets).toEqual(VALID_DANTE_PRESET_RESPONSE)
		expect(chazyControl.controlEvents).toEqual(VALID_CONTROL_EVENT_RESPONSE)
		expect(chazyControl.controlEventLog).toEqual(VALID_CONTROL_EVENT_LOG_RESPONSE)
	})

	it('keeps polling the other queries when one query fails to parse', async () => {
		const { instance, sendMsg } = createMockInstance()
		sendMsg.mockImplementation(async (msg) => {
			if (msg.method === 'capture') throw new Error('Unexpected capture request')
			if (msg.data === 'time') return { not: 'a valid time response' }
			return {
				dante: VALID_DANTE_RESPONSE,
				dantepreset: VALID_DANTE_PRESET_RESPONSE,
				mxsta: VALID_MXSTA_RESPONSE,
				controlevent: VALID_CONTROL_EVENT_RESPONSE,
				controleventlog: VALID_CONTROL_EVENT_LOG_RESPONSE,
			}[msg.data]
		})
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		chazyControl.startPolling()
		await vi.waitFor(() => expect(chazyControl.controlEventLog).not.toBeNull())

		expect(chazyControl.time).toBeNull() // failed to parse, rest still populated
		expect(chazyControl.mxsta).toEqual(VALID_MXSTA_PARSED)
		expect(chazyControl.controlEvents).toEqual(VALID_CONTROL_EVENT_RESPONSE)
	})

	it('emits dante_device_changed only when the device set actually changes', async () => {
		vi.useFakeTimers()
		const { instance, sendMsg } = createMockInstance()
		let danteDeviceName = 'Device A'
		sendMsg.mockImplementation(async (msg) => {
			if (msg.method === 'capture') throw new Error('Unexpected capture request')
			if (msg.data === 'dante') {
				return { ...VALID_DANTE_RESPONSE, dante: [{ ...emptyDanteDevice(), name: danteDeviceName }] }
			}
			return {
				dantepreset: VALID_DANTE_PRESET_RESPONSE,
				mxsta: VALID_MXSTA_RESPONSE,
				time: VALID_TIME_RESPONSE,
				controlevent: VALID_CONTROL_EVENT_RESPONSE,
				controleventlog: VALID_CONTROL_EVENT_LOG_RESPONSE,
			}[msg.data]
		})
		const chazyControl = new ChazyControl(instance, 1000, 1000)
		const onChanged = vi.fn()
		chazyControl.on('dante_device_changed', onChanged)

		// First poll: nothing -> ["Device A"] is a change.
		chazyControl.startPolling()
		await flushMicrotasks()
		expect(onChanged).toHaveBeenCalledTimes(1)

		// Same device set on the next cycle — no further emit.
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onChanged).toHaveBeenCalledTimes(1)

		// Device set changes — emits again.
		danteDeviceName = 'Device B'
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onChanged).toHaveBeenCalledTimes(2)
	})

	it('emits encoder_device_changed only when the encoder set actually changes', async () => {
		vi.useFakeTimers()
		const { instance, sendMsg } = createMockInstance()
		let encoderName = 'Encoder A'
		sendMsg.mockImplementation(async (msg) => {
			if (msg.method === 'capture') throw new Error('Unexpected capture request')
			if (msg.data === 'mxsta') {
				return {
					...VALID_MXSTA_RESPONSE,
					in: [{ ...emptyEncoderStatus(), name: encoderName, ip: '169.254.3.140' }],
				}
			}
			return {
				dante: VALID_DANTE_RESPONSE,
				dantepreset: VALID_DANTE_PRESET_RESPONSE,
				time: VALID_TIME_RESPONSE,
				controlevent: VALID_CONTROL_EVENT_RESPONSE,
				controleventlog: VALID_CONTROL_EVENT_LOG_RESPONSE,
			}[msg.data]
		})
		const chazyControl = new ChazyControl(instance, 1000, 1000)
		const onEncoderChanged = vi.fn()
		const onDecoderChanged = vi.fn()
		chazyControl.on('encoder_device_changed', onEncoderChanged)
		chazyControl.on('decoder_device_changed', onDecoderChanged)

		// First poll: nothing -> ["Encoder A"] is a change.
		chazyControl.startPolling()
		await flushMicrotasks()
		expect(onEncoderChanged).toHaveBeenCalledTimes(1)

		// Same encoder set on the next cycle — no further emit.
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onEncoderChanged).toHaveBeenCalledTimes(1)

		// Encoder name changes — emits again.
		encoderName = 'Encoder B'
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onEncoderChanged).toHaveBeenCalledTimes(2)

		// Never mistaken for a decoder change.
		expect(onDecoderChanged).not.toHaveBeenCalled()
	})

	it('emits decoder_device_changed only when the decoder set actually changes', async () => {
		vi.useFakeTimers()
		const { instance, sendMsg } = createMockInstance()
		let decoderIp = '169.254.2.58'
		sendMsg.mockImplementation(async (msg) => {
			if (msg.method === 'capture') throw new Error('Unexpected capture request')
			if (msg.data === 'mxsta') {
				return {
					...VALID_MXSTA_RESPONSE,
					out: [{ ...emptyDecoderStatus(), name: 'Decoder A', ip: decoderIp }],
				}
			}
			return {
				dante: VALID_DANTE_RESPONSE,
				dantepreset: VALID_DANTE_PRESET_RESPONSE,
				time: VALID_TIME_RESPONSE,
				controlevent: VALID_CONTROL_EVENT_RESPONSE,
				controleventlog: VALID_CONTROL_EVENT_LOG_RESPONSE,
			}[msg.data]
		})
		const chazyControl = new ChazyControl(instance, 1000, 1000)
		const onEncoderChanged = vi.fn()
		const onDecoderChanged = vi.fn()
		chazyControl.on('encoder_device_changed', onEncoderChanged)
		chazyControl.on('decoder_device_changed', onDecoderChanged)

		// First poll: nothing -> one decoder is a change.
		chazyControl.startPolling()
		await flushMicrotasks()
		expect(onDecoderChanged).toHaveBeenCalledTimes(1)

		// Same decoder on the next cycle — no further emit.
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onDecoderChanged).toHaveBeenCalledTimes(1)

		// IP changes (name unchanged) — still counts as a change.
		decoderIp = '169.254.2.59'
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onDecoderChanged).toHaveBeenCalledTimes(2)

		// Never mistaken for an encoder change.
		expect(onEncoderChanged).not.toHaveBeenCalled()
	})

	it('emits dante_preset_changed only when the preset set actually changes', async () => {
		vi.useFakeTimers()
		const { instance, sendMsg } = createMockInstance()
		let presetName = 'Preset A'
		sendMsg.mockImplementation(async (msg) => {
			if (msg.method === 'capture') throw new Error('Unexpected capture request')
			if (msg.data === 'dantepreset') {
				return { dante_preset: [{ id: 1, name: presetName }] }
			}
			return {
				dante: VALID_DANTE_RESPONSE,
				mxsta: VALID_MXSTA_RESPONSE,
				time: VALID_TIME_RESPONSE,
				controlevent: VALID_CONTROL_EVENT_RESPONSE,
				controleventlog: VALID_CONTROL_EVENT_LOG_RESPONSE,
			}[msg.data]
		})
		const chazyControl = new ChazyControl(instance, 1000, 1000)
		const onChanged = vi.fn()
		chazyControl.on('dante_preset_changed', onChanged)

		// First poll: nothing -> [{ id: 1, name: "Preset A" }] is a change.
		chazyControl.startPolling()
		await flushMicrotasks()
		expect(onChanged).toHaveBeenCalledTimes(1)

		// Same preset set on the next cycle — no further emit.
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onChanged).toHaveBeenCalledTimes(1)

		// Preset renamed — emits again.
		presetName = 'Preset B'
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onChanged).toHaveBeenCalledTimes(2)
	})

	it('emits poll_complete on every cycle, even when nothing changed', async () => {
		vi.useFakeTimers()
		const { instance, sendMsg } = createMockInstance()
		mockAllStatusQueries(sendMsg)
		const chazyControl = new ChazyControl(instance, 1000, 1000)
		const onPollComplete = vi.fn()
		chazyControl.on('poll_complete', onPollComplete)

		chazyControl.startPolling()
		await flushMicrotasks()
		expect(onPollComplete).toHaveBeenCalledTimes(1)

		// Nothing changes between cycles, but it still fires each time.
		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onPollComplete).toHaveBeenCalledTimes(2)

		await vi.advanceTimersByTimeAsync(1000)
		await flushMicrotasks()
		expect(onPollComplete).toHaveBeenCalledTimes(3)
	})

	it('does not emit poll_complete once the signal is aborted', async () => {
		vi.useFakeTimers()
		const { instance, sendMsg } = createMockInstance()
		mockAllStatusQueries(sendMsg)
		const controller = new AbortController()
		const chazyControl = new ChazyControl(instance, 1000, 1000, controller.signal)
		const onPollComplete = vi.fn()
		chazyControl.on('poll_complete', onPollComplete)

		chazyControl.startPolling()
		await flushMicrotasks()
		expect(onPollComplete).toHaveBeenCalledTimes(1)

		controller.abort()
		await vi.advanceTimersByTimeAsync(5000)
		await flushMicrotasks()
		expect(onPollComplete).toHaveBeenCalledTimes(1)
	})
})

describe('ChazyControl feedback image polling', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it('does not poll for images until a feedback is registered', () => {
		vi.useFakeTimers()
		const { instance, checkFeedbacksById } = createMockInstance()
		const chazyControl = new ChazyControl(instance, 5000, 1000)

		vi.advanceTimersByTime(5000)

		expect(checkFeedbacksById).not.toHaveBeenCalled()
		expect(chazyControl.getFeedbacksToPoll().size).toBe(0)
	})

	it('polls checkFeedbacksById on the image interval once a feedback is registered', () => {
		vi.useFakeTimers()
		const { instance, checkFeedbacksById } = createMockInstance()
		const chazyControl = new ChazyControl(instance, 5000, 1000)

		chazyControl.addFeedbackToPoll('feedback-1')
		expect(chazyControl.getFeedbacksToPoll()).toEqual(new Set(['feedback-1']))

		vi.advanceTimersByTime(1000)
		expect(checkFeedbacksById).toHaveBeenCalledWith('feedback-1')

		vi.advanceTimersByTime(1000)
		expect(checkFeedbacksById).toHaveBeenCalledTimes(2)
	})

	it('stops polling once the last feedback is removed', () => {
		vi.useFakeTimers()
		const { instance, checkFeedbacksById } = createMockInstance()
		const chazyControl = new ChazyControl(instance, 5000, 1000)

		chazyControl.addFeedbackToPoll('feedback-1')
		vi.advanceTimersByTime(1000)
		expect(checkFeedbacksById).toHaveBeenCalledTimes(1)

		chazyControl.removeFeedbackToPoll('feedback-1')
		vi.advanceTimersByTime(5000)
		expect(checkFeedbacksById).toHaveBeenCalledTimes(1) // no further calls
		expect(chazyControl.getFeedbacksToPoll().size).toBe(0)
	})

	it('keeps polling while at least one feedback is still registered', () => {
		vi.useFakeTimers()
		const { instance, checkFeedbacksById } = createMockInstance()
		const chazyControl = new ChazyControl(instance, 5000, 1000)

		chazyControl.addFeedbackToPoll('feedback-1')
		chazyControl.addFeedbackToPoll('feedback-2')
		chazyControl.removeFeedbackToPoll('feedback-1')

		vi.advanceTimersByTime(1000)
		expect(checkFeedbacksById).toHaveBeenCalledWith('feedback-2')
	})

	it('stops image polling when the signal aborts', () => {
		vi.useFakeTimers()
		const { instance, checkFeedbacksById } = createMockInstance()
		const controller = new AbortController()
		const chazyControl = new ChazyControl(instance, 5000, 1000, controller.signal)

		chazyControl.addFeedbackToPoll('feedback-1')
		vi.advanceTimersByTime(1000)
		expect(checkFeedbacksById).toHaveBeenCalledTimes(1)

		controller.abort()
		vi.advanceTimersByTime(5000)
		expect(checkFeedbacksById).toHaveBeenCalledTimes(1) // no further calls after abort
	})
})

describe('ChazyControl.getCapturePreview', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(0)
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('fetches a capture and converts it via jpegBufferToPng64', async () => {
		const { instance, sendMsg } = createMockInstance()
		sendMsg.mockResolvedValue(Buffer.from('fake-jpeg-bytes'))
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		const png64 = await chazyControl.getCapturePreview('169.254.3.140', 240)

		expect(sendMsg).toHaveBeenCalledWith({ method: 'capture', ip: '169.254.3.140', width: 240 })
		expect(png64).toBe(`data:image/png;base64,mock(${Buffer.from('fake-jpeg-bytes').toString('hex')})`)
	})

	it('dedupes concurrent/subsequent calls for the same ip+width within the poll interval', async () => {
		const { instance, sendMsg } = createMockInstance()
		sendMsg.mockResolvedValue(Buffer.from('fake-jpeg-bytes'))
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		const [first, second] = await Promise.all([
			chazyControl.getCapturePreview('169.254.3.140', 240),
			chazyControl.getCapturePreview('169.254.3.140', 240),
		])
		vi.advanceTimersByTime(1000)
		const third = await chazyControl.getCapturePreview('169.254.3.140', 240)

		expect(sendMsg).toHaveBeenCalledTimes(1)
		expect(first).toBe(second)
		expect(first).toBe(third)
	})

	it('fetches separately for a different ip or width', async () => {
		const { instance, sendMsg } = createMockInstance()
		sendMsg.mockResolvedValue(Buffer.from('fake-jpeg-bytes'))
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		await chazyControl.getCapturePreview('169.254.3.140', 240)
		await chazyControl.getCapturePreview('169.254.3.141', 240)
		await chazyControl.getCapturePreview('169.254.3.140', 480)

		expect(sendMsg).toHaveBeenCalledTimes(3)
	})

	it('refetches after the cache entry expires', async () => {
		const { instance, sendMsg } = createMockInstance()
		sendMsg.mockResolvedValue(Buffer.from('fake-jpeg-bytes'))
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		await chazyControl.getCapturePreview('169.254.3.140', 240)
		vi.advanceTimersByTime(5001)
		await chazyControl.getCapturePreview('169.254.3.140', 240)

		expect(sendMsg).toHaveBeenCalledTimes(2)
	})

	it('allows a retry after a failed capture instead of returning the stale rejection', async () => {
		const { instance, sendMsg } = createMockInstance()
		sendMsg.mockRejectedValueOnce(new Error('device unreachable'))
		sendMsg.mockResolvedValueOnce(Buffer.from('fake-jpeg-bytes'))
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		await expect(chazyControl.getCapturePreview('169.254.3.140', 240)).rejects.toThrow('device unreachable')
		// Immediately after, well within the TTL window, a retry should still go out rather
		// than re-returning (and re-throwing) the same cached rejection.
		await expect(chazyControl.getCapturePreview('169.254.3.140', 240)).resolves.toBe(
			`data:image/png;base64,mock(${Buffer.from('fake-jpeg-bytes').toString('hex')})`,
		)

		expect(sendMsg).toHaveBeenCalledTimes(2)
	})
})

describe('ChazyControl.getDantePresetChoices', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	async function chazyControlWithPresets(presets: { id: number; name: string }[]) {
		const { instance, sendMsg } = createMockInstance()
		sendMsg.mockImplementation(async (msg) => {
			if (msg.method === 'capture') throw new Error('Unexpected capture request')
			if (msg.data === 'dantepreset') return { dante_preset: presets }
			return {
				dante: VALID_DANTE_RESPONSE,
				mxsta: VALID_MXSTA_RESPONSE,
				time: VALID_TIME_RESPONSE,
				controlevent: VALID_CONTROL_EVENT_RESPONSE,
				controleventlog: VALID_CONTROL_EVENT_LOG_RESPONSE,
			}[msg.data]
		})
		const chazyControl = new ChazyControl(instance, 5000, 5000)
		chazyControl.startPolling()
		await vi.waitFor(() => expect(chazyControl.dantePresets).not.toBeNull())
		return chazyControl
	}

	it('returns [] before the first poll, regardless of includeEmpty', () => {
		const { instance } = createMockInstance()
		const chazyControl = new ChazyControl(instance, 5000, 5000)

		expect(chazyControl.getDantePresetChoices()).toEqual([])
		expect(chazyControl.getDantePresetChoices(true)).toEqual(
			Array.from({ length: 256 }, (_, i) => ({ id: i + 1, label: '(empty)' })),
		)
	})

	it('without includeEmpty, lists only the known presets', async () => {
		const chazyControl = await chazyControlWithPresets([
			{ id: 3, name: 'Show A' },
			{ id: 200, name: 'Show B' },
		])

		expect(chazyControl.getDantePresetChoices()).toEqual([
			{ id: 3, label: 'Show A' },
			{ id: 200, label: 'Show B' },
		])
	})

	it('with includeEmpty, lists all 256 handles with known presets labeled and the rest "(empty)"', async () => {
		const chazyControl = await chazyControlWithPresets([
			{ id: 3, name: 'Show A' },
			{ id: 200, name: 'Show B' },
		])

		const choices = chazyControl.getDantePresetChoices(true)

		expect(choices).toHaveLength(256)
		expect(choices[0]).toEqual({ id: 1, label: '(empty)' })
		expect(choices[2]).toEqual({ id: 3, label: 'Show A' })
		expect(choices[199]).toEqual({ id: 200, label: 'Show B' })
		expect(choices[255]).toEqual({ id: 256, label: '(empty)' })
	})
})

function emptyDanteDevice() {
	return {
		name: '',
		unlicensed: 0,
		ol: 1,
		primac: '',
		pristatic: 0,
		col: 0,
		priip: '',
		primask: '',
		prigw: '',
		pridns: '',
		prispeed: 0,
		secip: '',
		secspeed: 0,
		manfname: '',
		manfmodel: '',
		modelver: '',
		dantemodel: '',
		owndep: 0,
		swver: '',
		clksrc: '',
		sync: '',
		mute: 0,
		intfmode: 0,
		primultiv1: '',
		primultiv2: '',
		secmultiv1: '',
		secmultiv2: '',
		aes67spt: 0,
		aes67on: 0,
		aes67prefix: 0,
		clrconfspt: 0,
		preferredspt: 0,
		preferred: 0,
		aes67dev: 0,
		aes67src: '',
		aes67sid: 0,
		aes67clk: 0,
		aes67pridest: '',
		resetspt: 0,
		setratespt: 0,
		setencodingspt: 0,
		staticipspt: 0,
		pullupspt: 0,
		rxlatencylist: [],
		rxlatencymin: 0,
		rxlatency: 0,
		rxlatencymax: 0,
		lock: 0,
		srate: 0,
		srate_array: [],
		enc: 0,
		encs_array: [],
		rxchn: [],
		txchn: [],
		txflow: [],
	}
}

function emptyEncoderStatus() {
	return {
		domainid: 0,
		id: 0,
		name: '',
		time: [0, 0, 0] as [number, number, number],
		state: '',
		ol: 1,
		active: 1,
		network: 1,
		ver: '',
		model: '',
		hw_mode: '',
		sw_mode: '',
		devtype: '',
		auth: 0,
		remainday: 0,
		UID: '',
		flash_size: 0,
		board_revision: 0,
		dante_en: 0,
		multicast: 0,
		bridge: 0,
		mcu_ver: '',
		im: 0,
		ip: '',
		gw: '',
		sm: '',
		mac: '',
		dvlan: 0,
		dvtag: 0,
		lan2_im: 0,
		lan2_ip: '',
		lan2_gw: '',
		lan2_sm: '',
		asel: 0,
		afr: 0,
		license: 0,
		em: 0,
		ei: 0,
		edidmax: 0,
		resolution: '',
		color: '',
		depth: '',
		hdcp: '',
		aud: 0,
		audstream: 0,
		sig: 0,
		conn: '',
		arccap: 0,
		discec: 0,
		isp: 0,
		led: 0,
		fplock: 0,
		sgen: 0,
		sgbr: 0,
		sgbs: 0,
		sgpa: 0,
		sgsb: 0,
		profile: 0,
		usb: 0,
		udatamode: 0,
		vsrc: 0,
		vauto: 0,
		fan: 0,
		lanmode: 0,
		irmode: 0,
		ircable: 0,
		netmode: 0,
		arcmode: 0,
		iovoltage: 0,
		io1dir: 0,
		io2dir: 0,
		io1: 0,
		io2: 0,
		relay1: 0,
		relay2: 0,
		ssenable: 0,
		ssmainurl: '',
		ssmainenctype: '',
		ssmainbitrate: '',
		ssmainfps: '',
		ssmaingop: '',
		ssmainprofile: '',
		ssmainrcmode: '',
		ssmainres: '',
		sssuburl: '',
		sssubenctype: '',
		sssubbitrate: '',
		sssubfps: '',
		sssubgop: '',
		sssubprofile: '',
		sssubrcmode: '',
		sssubres: '',
		ssgateway: '',
		ssip: '',
		ssmask: '',
		ssipmode: '',
		ssmac: '',
		ssversion: '',
		ssworkmode: '',
		ssvlan: 0,
	}
}

function emptyDecoderStatus() {
	return {
		domainid: 0,
		id: 0,
		name: '',
		time: [0, 0, 0] as [number, number, number],
		state: '',
		ol: 1,
		active: 1,
		network: 1,
		ver: '',
		model: '',
		hw_mode: '',
		sw_mode: '',
		devtype: '',
		auth: 0,
		remainday: 0,
		UID: '',
		flash_size: 0,
		dante_en: 0,
		multicast: 0,
		ull: 0,
		bridge: 0,
		das: 0,
		mcu_ver: '',
		im: 0,
		ip: '',
		gw: '',
		sm: '',
		mac: '',
		dvlan: 0,
		dvtag: 0,
		lan2_im: 0,
		lan2_ip: '',
		lan2_gw: '',
		lan2_sm: '',
		fr: 0,
		vsel: 0,
		asel: 0,
		rsel: 0,
		ssel: 0,
		usel: 0,
		csel: 0,
		msel: 0,
		vfr: 0,
		afr: 0,
		rfr: 0,
		sfr: 0,
		ufr: 0,
		cfr: 0,
		vwen: 0,
		om: 0,
		sig: 0,
		conn: '',
		snkinfospt: 0,
		preferred: '',
		hdcpcap: '',
		arccap: 0,
		earcen: 0,
		vw: 0,
		hdr: 0,
		vwrow: 0,
		vwcolumn: 0,
		vwhpos: 0,
		vwvpos: 0,
		rotate: 0,
		res: 0,
		resmax: 0,
		hactive: 0,
		hfp: 0,
		hsync: 0,
		hbp: 0,
		htotal: 0,
		vactive: 0,
		vfp: 0,
		vsync: 0,
		vbp: 0,
		vtotal: 0,
		refresh: 0,
		color: 0,
		hpolarity: 0,
		vpolarity: 0,
		dclk: 0,
		dclk_ntsc: 0,
		colorspace: 0,
		csspt: 0,
		discec: 0,
		osp: 0,
		txout: 0,
		black: 0,
		pause: 0,
		autoon: 0,
		led: 0,
		fplock: 0,
		sgen: 0,
		sgbr: 0,
		sgbs: 0,
		sgpa: 0,
		sgsb: 0,
		lanmode: 0,
		irmode: 0,
		ircable: 0,
		netmode: 0,
		arcmode: 0,
		iovoltage: 0,
		io1dir: 0,
		io2dir: 0,
		io1: 0,
		io2: 0,
		relay1: 0,
		relay2: 0,
		opten: 0,
		osd: 0,
		osdcolor: 0,
		osdinfo: 0,
		usboip: 0,
		udatamode: 0,
		usbdata: '',
		audstream: 0,
		license: 0,
		hotkey: [],
		ssmainurl: '',
	}
}
