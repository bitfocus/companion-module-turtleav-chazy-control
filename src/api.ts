import { EventEmitter } from 'node:events'

import { createModuleLogger, type DropdownChoice } from '@companion-module/base'
import type { z } from 'zod'
import type { Message } from './types.js'
import { ChazyDanteResponseSchema, type ChazyDanteResponse } from './schemas/dante.js'
import { ChazyDantePresetResponseSchema, type ChazyDantePresetResponse } from './schemas/dantepreset.js'
import { ChazyMxStaResponseSchema, type ChazyMxStaResponse } from './schemas/mxsta.js'
import { ChazyTimeResponseSchema, type ChazyTimeResponse } from './schemas/time.js'
import { ChazyControlEventResponseSchema, type ChazyControlEventResponse } from './schemas/controlevent.js'
import { ChazyControlEventLogResponseSchema, type ChazyControlEventLogResponse } from './schemas/controleventlog.js'
import type ModuleInstance from './main.js'
import { jpegBufferToPng64 } from './utils/image.js'

function assertValidPositiveInteger(value: number, label: string): void {
	if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid ${label} ${value}`)
}

function assertValidChannel(chan: number): void {
	if (chan < 0 || !Number.isInteger(chan)) throw new Error(`Invalid channel ${chan}`)
}

function validateName(name: string): string {
	const validName = name.substring(0, 31).trim()
	if (validName.startsWith('-') || validName.endsWith('-')) throw new Error(`Invalid name ${name}`)
	return validName
}

function assertValidRange(value: number, min: number, max: number, label: string): void {
	if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${label} ${value}`)
}

export function assertValidIPv4(ip: string, label: string): void {
	const octets = ip.split('.')
	if (octets.length !== 4 || !octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)) {
		throw new Error(`Invalid ${label} ${ip}`)
	}
}

function assertValidChannelSlotList(slot: string): void {
	const ids = slot.split(':')
	if (ids.length === 0 || !ids.every((id) => /^\d+$/.test(id) && Number(id) >= 1)) {
		throw new Error(`Invalid channel slot list ${slot}`)
	}
}

function assertValidHandle(hdl: number, label: string): void {
	assertValidRange(hdl, 1, 256, label)
}

function assertValidNameMaxLength(name: string, maxLength: number, label: string): void {
	if (name.length === 0 || name.length > maxLength) throw new Error(`Invalid ${label} ${name}`)
}

function assertValidMaxLength(value: string, maxLength: number, label: string): void {
	if (value.length > maxLength) throw new Error(`Invalid ${label} ${value}`)
}

function assertValidHexBytes(value: string, maxBytes: number, label: string): void {
	const bytes = value.trim().split(/\s+/).filter(Boolean)
	if (bytes.length === 0 || bytes.length > maxBytes || !bytes.every((byte) => /^[0-9A-Fa-f]{2}$/.test(byte))) {
		throw new Error(`Invalid ${label} ${value}`)
	}
}

export const EVENT_TYPES = {
	IR: '01',
	RS232: '02',
	CEC: '03',
	TCP: '04',
	UDP: '05',
	HTTP_GET: '06',
	HTTP_POST: '07',
	HTTPS_GET: '08',
	HTTPS_POST: '09',
} as const

export type EventType = keyof typeof EVENT_TYPES

export type DecoderSwitchSignal = 'ALL' | 'VIDEO' | 'AUDIO' | 'IR' | 'RS232' | 'USB' | 'CEC' | 'MEDIA'

export interface ChazyControlEvents {
	/** Emitted whenever the dante devices found on the network change. */
	dante_device_changed: []
	/** Emitted whenever an encoder's name or IP changes, or encoders are added/removed. */
	encoder_device_changed: []
	/** Emitted whenever a decoder's name or IP changes, or decoders are added/removed. */
	decoder_device_changed: []
	/** Emitted whenever a dante preset's name changes, or presets are added/removed. */
	dante_preset_changed: []
	/** Emitted at the end of every poll cycle, whether or not anything changed. */
	poll_complete: []
}

function areSetsEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false
	const setA = new Set(a)
	return b.every((entry) => setA.has(entry))
}

function toDeviceSignature(device: { name: string; ip: string }): string {
	return `${device.name}|${device.ip}`
}

function toPresetSignature(preset: { id: number; name: string }): string {
	return `${preset.id}|${preset.name}`
}

export default class ChazyControl extends EventEmitter<ChazyControlEvents> {
	#logger = createModuleLogger('ChazyControl')
	#instance!: ModuleInstance
	#dante: ChazyDanteResponse | null = null
	#dantePreset: ChazyDantePresetResponse | null = null
	#mxsta: ChazyMxStaResponse | null = null
	#time: ChazyTimeResponse | null = null
	#controlEvent: ChazyControlEventResponse | null = null
	#controlEventLog: ChazyControlEventLogResponse | null = null
	#pollTimer: NodeJS.Timeout | null = null
	#pollInterval = 10000
	#signal?: AbortSignal

	#feedbacksToPoll = new Set<string>()
	#imagePollTimer: NodeJS.Timeout | null = null
	#imagePollInterval: number
	#captureCache = new Map<string, { timestamp: number; promise: Promise<string> }>()

	constructor(instance: ModuleInstance, pollInterval = 10000, imagePollInterval = 10000, signal?: AbortSignal) {
		super()
		this.#instance = instance
		this.#pollInterval = pollInterval
		this.#imagePollInterval = imagePollInterval
		this.#signal = signal

		if (this.#signal) {
			this.#signal.addEventListener('abort', () => this.#stopPolling(), { once: true })
		}
	}

	public startPolling(): void {
		if (this.#signal?.aborted) return
		void this.#pollOnce()
	}

	#stopPolling(): void {
		if (this.#pollTimer) {
			clearTimeout(this.#pollTimer)
			this.#pollTimer = null
		}
		this.#stopImagePolling()
	}

	async #pollOnce(): Promise<void> {
		if (this.#signal?.aborted) return

		await this.#pollSchema('dante devices', ChazyControl.getDanteDevices(), ChazyDanteResponseSchema, (parsed) => {
			const newNames = parsed.dante.map((dev) => dev.name)
			const oldNames = this.#dante?.dante.map((dev) => dev.name) ?? []

			this.#dante = parsed

			if (!areSetsEqual(newNames, oldNames)) {
				this.emit('dante_device_changed')
			}
		})
		await this.#pollSchema(
			'dante presets',
			ChazyControl.getDantePresets(),
			ChazyDantePresetResponseSchema,
			(parsed) => {
				const newPresets = parsed.dante_preset.map(toPresetSignature)
				const oldPresets = this.#dantePreset?.dante_preset.map(toPresetSignature) ?? []

				this.#dantePreset = parsed

				if (!areSetsEqual(newPresets, oldPresets)) {
					this.emit('dante_preset_changed')
				}
			},
		)
		await this.#pollSchema('matrix status', ChazyControl.getMxSta(), ChazyMxStaResponseSchema, (parsed) => {
			const newEncoders = parsed.in.map(toDeviceSignature)
			const oldEncoders = this.#mxsta?.in.map(toDeviceSignature) ?? []
			const newDecoders = parsed.out.map(toDeviceSignature)
			const oldDecoders = this.#mxsta?.out.map(toDeviceSignature) ?? []

			this.#mxsta = parsed

			if (!areSetsEqual(newEncoders, oldEncoders)) {
				this.emit('encoder_device_changed')
			}
			if (!areSetsEqual(newDecoders, oldDecoders)) {
				this.emit('decoder_device_changed')
			}
		})
		await this.#pollSchema('time', ChazyControl.getTime(), ChazyTimeResponseSchema, (parsed) => {
			this.#time = parsed
		})
		await this.#pollSchema(
			'control events',
			ChazyControl.getControlEvents(),
			ChazyControlEventResponseSchema,
			(parsed) => {
				this.#controlEvent = parsed
			},
		)
		await this.#pollSchema(
			'control event log',
			ChazyControl.getControlEventLog(),
			ChazyControlEventLogResponseSchema,
			(parsed) => {
				this.#controlEventLog = parsed
			},
		)

		if (!this.#signal?.aborted) {
			this.emit('poll_complete')

			this.#pollTimer = setTimeout(() => {
				void this.#pollOnce()
			}, this.#pollInterval)
		}
	}

	// Runs one status query in isolation, so a failure to fetch or parse it doesn't stop
	// the other queries in the same poll cycle from running.
	async #pollSchema<T>(
		label: string,
		msg: Message & { method: 'get' },
		schema: z.ZodType<T>,
		store: (parsed: T) => void,
	): Promise<void> {
		try {
			const json = await this.#instance.sendMsg(msg, this.#signal)
			store(schema.parse(json))
		} catch (err) {
			if (this.#signal?.aborted) {
				// Expected: the signal aborted mid-request (config update / destroy). Stop quietly.
				return
			}
			this.#logger.error(`Failed to poll ${label}: ${(err as Error).message}`)
		}
	}

	// The set of feedback ids currently expecting a periodic image refresh — read by
	// `main.ts` when recreating this instance across a config update, so polling resumes
	// for feedbacks that were already tracked rather than going silent until Companion
	// happens to recheck them.
	public getFeedbacksToPoll(): ReadonlySet<string> {
		return this.#feedbacksToPoll
	}

	public addFeedbackToPoll(feedbackId: string): void {
		this.#feedbacksToPoll.add(feedbackId)
		this.#ensureImagePolling()
	}

	public removeFeedbackToPoll(feedbackId: string): void {
		this.#feedbacksToPoll.delete(feedbackId)
		if (this.#feedbacksToPoll.size === 0) {
			this.#stopImagePolling()
		}
	}

	#ensureImagePolling(): void {
		if (this.#imagePollTimer || this.#signal?.aborted) return
		this.#imagePollTimer = setInterval(() => {
			this.#instance.checkFeedbacksById(...this.#feedbacksToPoll)
		}, this.#imagePollInterval)
	}

	#stopImagePolling(): void {
		if (this.#imagePollTimer) {
			clearInterval(this.#imagePollTimer)
			this.#imagePollTimer = null
		}
	}

	// Central capture + JPEG->PNG conversion, cached per ip+width so multiple feedbacks
	// pointed at the same device don't each trigger their own request every poll interval.
	public async getCapturePreview(ip: string, width: number): Promise<string> {
		const key = `${ip}:${width}`
		const cached = this.#captureCache.get(key)
		if (cached && Date.now() - cached.timestamp < this.#imagePollInterval) {
			return cached.promise
		}

		const msg: Message & { method: 'capture' } = { method: 'capture', ip, width }
		const promise = this.#instance.sendMsg(msg).then(jpegBufferToPng64)
		promise.catch(() => this.#captureCache.delete(key))
		this.#captureCache.set(key, { timestamp: Date.now(), promise })
		return promise
	}

	// Commands For Device Management

	static search(): Message & { method: 'submit' } {
		return { data: 'SEARCH', method: 'submit' }
	}

	static getSearchStatus(): Message & { method: 'submit' } {
		return { data: 'GET SEARCH STATUS', method: 'submit' }
	}

	static searchReset(): Message & { method: 'submit' } {
		return { data: 'SEARCH RESET', method: 'submit' }
	}

	static addDeviceEncoder(dev: number, enc: number): Message & { method: 'submit' } {
		assertValidPositiveInteger(dev, 'search list index')
		assertValidPositiveInteger(enc, 'encoder')
		return { data: `ADD DEV ${dev} ENC ${enc}`, method: 'submit' }
	}

	static addDeviceDecoder(dev: number, dec: number): Message & { method: 'submit' } {
		assertValidPositiveInteger(dev, 'search list index')
		assertValidPositiveInteger(dec, 'decoder')
		return { data: `ADD DEV ${dev} DEC ${dec}`, method: 'submit' }
	}

	static addDeviceReset(): Message & { method: 'submit' } {
		return { data: 'ADD DEV RESET', method: 'submit' }
	}

	static addAutoAll(): Message & { method: 'submit' } {
		return { data: 'ADD AUTO ALL', method: 'submit' }
	}

	// Commands For Decoder Control

	static switchDecoder(dec: number, enc: number, signal: DecoderSwitchSignal): Message & { method: 'submit' } {
		assertValidRange(dec, 1, 999, 'decoder')
		assertValidRange(enc, 0, 999, 'encoder')
		return { data: `SET DEC ${dec} SWITCH ${enc} ${signal}`, method: 'submit' }
	}

	static setDecoderUsbData(dec: number, state: 'ON' | 'OFF'): Message & { method: 'submit' } {
		assertValidRange(dec, 1, 999, 'decoder')
		return { data: `SET DEC ${dec} USB DATA ${state}`, method: 'submit' }
	}

	// Status queries polled every `#pollOnce`

	static getMxSta(): Message & { method: 'get' } {
		return { data: 'mxsta', method: 'get' }
	}

	static getTime(): Message & { method: 'get' } {
		return { data: 'time', method: 'get' }
	}

	static getControlEvents(): Message & { method: 'get' } {
		return { data: 'controlevent', method: 'get' }
	}

	static getControlEventLog(): Message & { method: 'get' } {
		return { data: 'controleventlog', method: 'get' }
	}

	// Commands For Dante Control

	static getDanteDevices(): Message & { method: 'get' } {
		return { data: 'dante', method: 'get' }
	}

	static setDanteName(devname: string, name: string): Message & { method: 'submit' } {
		const dev = validateName(devname)
		const validName = validateName(name)
		return { data: `SET DANTE DEV ${dev} NAME ${validName}`, method: 'submit' }
	}

	static setDanteSampleRate(devname: string, rate: string): Message & { method: 'submit' } {
		const dev = validateName(devname)
		return { data: `SET DANTE DEV ${dev} SRATE ${rate}`, method: 'submit' }
	}

	static setDanteEncoding(devname: string, enc: string): Message & { method: 'submit' } {
		const dev = validateName(devname)
		return { data: `SET DANTE DEV ${dev} ENC ${enc}`, method: 'submit' }
	}

	static setDanteTxChannelName(
		devname: string,
		av: 'AUDIO' | 'VIDEO',
		chn: number,
		name: string,
	): Message & { method: 'submit' } {
		const dev = validateName(devname)
		assertValidPositiveInteger(chn, 'channel')
		const validName = validateName(name)
		return { data: `SET DANTE DEV ${dev} ${av} TXCHN ${chn} NAME ${validName}`, method: 'submit' }
	}

	static addDanteTransmitFlow(
		devname: string,
		av: 'AUDIO' | 'VIDEO',
		name: string,
		id: number,
		slot: string,
	): Message & { method: 'submit' } {
		const dev = validateName(devname)
		const flowName = validateName(name)
		assertValidPositiveInteger(id, 'multicast transmit flow id')
		assertValidChannelSlotList(slot)
		return { data: `SET DANTE DEV ${dev} ${av} TXFLOW ${flowName} ID ${id} SLOT ${slot}`, method: 'submit' }
	}

	static deleteDanteTransmitFlow(devname: string, av: 'AUDIO' | 'VIDEO', id: number): Message & { method: 'submit' } {
		const dev = validateName(devname)
		assertValidPositiveInteger(id, 'multicast transmit flow id')
		return { data: `SET DANTE DEV ${dev} ${av} TXFLOW ${id} DELETE`, method: 'submit' }
	}

	static setDanteRxChannelName(
		devname: string,
		av: 'AUDIO' | 'VIDEO',
		chn: number,
		name: string,
	): Message & { method: 'submit' } {
		const dev = validateName(devname)
		assertValidPositiveInteger(chn, 'channel')
		const validName = validateName(name)
		return { data: `SET DANTE DEV ${dev} ${av} RXCHN ${chn} NAME ${validName}`, method: 'submit' }
	}

	static setDanteSubscription(
		rxDev: string,
		rxChan: number,
		av: 'AUDIO' | 'VIDEO',
		txDev: string,
		txChan: number,
	): Message & { method: 'submit' } {
		const msg: Message & { method: 'submit' } = { data: 'SET DANTE DEV ', method: 'submit' }
		assertValidChannel(rxChan)
		assertValidChannel(txChan)
		msg.data +=
			validateName(rxDev) + ' ' + av + ' RXCHN ' + rxChan + ' SOURCE ' + validateName(txDev) + ' CHN ' + txChan
		return msg
	}

	static setDanteLatency(devname: string, latency: string): Message & { method: 'submit' } {
		const dev = validateName(devname)
		return { data: `SET DANTE DEV ${dev} LATENCY ${latency}`, method: 'submit' }
	}

	static setDantePreferred(devname: string, state: 'ON' | 'OFF'): Message & { method: 'submit' } {
		const dev = validateName(devname)
		return { data: `SET DANTE DEV ${dev} PREFERRED ${state}`, method: 'submit' }
	}

	static setDanteAes67(devname: string, state: 'ON' | 'OFF'): Message & { method: 'submit' } {
		const dev = validateName(devname)
		return { data: `SET DANTE DEV ${dev} AES67 ${state}`, method: 'submit' }
	}

	static setDanteAes67Prefix(devname: string, prefix: number): Message & { method: 'submit' } {
		const dev = validateName(devname)
		assertValidRange(prefix, 0, 255, 'AES67 prefix')
		return { data: `SET DANTE DEV ${dev} AES67 PREFIX ${prefix}`, method: 'submit' }
	}

	static clearDanteConfig(devname: string, mode: 'KEEPIP' | 'ALL'): Message & { method: 'submit' } {
		const dev = validateName(devname)
		return { data: `SET DANTE DEV ${dev} CLEAR CONFIG ${mode}`, method: 'submit' }
	}

	static setDanteStaticIp(
		devname: string,
		intf: number,
		ip: string,
		mask: string,
		gateway: string,
		dns: string,
	): Message & { method: 'submit' } {
		const dev = validateName(devname)
		assertValidPositiveInteger(intf, 'interface')
		assertValidIPv4(ip, 'ip address')
		assertValidIPv4(mask, 'subnet mask')
		assertValidIPv4(gateway, 'gateway address')
		assertValidIPv4(dns, 'dns address')
		return {
			data: `SET DANTE DEV ${dev} INTERFACE ${intf} STATIC IP ${ip} MASK ${mask} GW ${gateway} DNS ${dns}`,
			method: 'submit',
		}
	}

	static setDanteDynamicIp(devname: string, intf: number): Message & { method: 'submit' } {
		const dev = validateName(devname)
		assertValidPositiveInteger(intf, 'interface')
		return { data: `SET DANTE DEV ${dev} INTERFACE ${intf} DYNAMIC`, method: 'submit' }
	}

	static rebootDanteDevice(devname: string, mode: 'SOFT' | 'FACTORY'): Message & { method: 'submit' } {
		const dev = validateName(devname)
		return { data: `SET DANTE DEV ${dev} REBOOT ${mode}`, method: 'submit' }
	}

	static clearDanteEvents(): Message & { method: 'submit' } {
		return { data: 'SET DANTE EVENT CLEAR', method: 'submit' }
	}

	static getDanteDeviceStatus(devname: string): Message & { method: 'submit' } {
		const dev = validateName(devname)
		return { data: `GET DANTE DEV ${dev} STATUS`, method: 'submit' }
	}

	static danteDeviceSearch(): Message & { method: 'submit' } {
		return { data: 'DANTE DEV SEARCH', method: 'submit' }
	}

	// Commands For Dante Preset Control

	static getDantePresets(): Message & { method: 'get' } {
		return { data: 'dantepreset', method: 'get' }
	}

	static createDantePreset(hdl: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'dante preset handle')
		return { data: `CREATE DANTE PRESET HANDLE ${hdl}`, method: 'submit' }
	}

	static deleteDantePreset(hdl: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'dante preset handle')
		return { data: `DELETE DANTE PRESET HANDLE ${hdl}`, method: 'submit' }
	}

	static setDantePresetName(hdl: number, name: string): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'dante preset handle')
		assertValidNameMaxLength(name, 32, 'dante preset name')
		return { data: `SET DANTE PRESET ${hdl} NAME ${name}`, method: 'submit' }
	}

	static applyDantePreset(hdl: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'dante preset handle')
		return { data: `APPLY DANTE PRESET ${hdl}`, method: 'submit' }
	}

	static getDantePresetStatus(hdl: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'dante preset handle')
		return { data: `GET DANTE PRESET ${hdl} STATUS`, method: 'submit' }
	}

	// Commands For Event Control

	static createEvent(hdl: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		return { data: `CREATE EVENT HANDLE ${hdl}`, method: 'submit' }
	}

	static deleteEvent(hdl: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		return { data: `DELETE EVENT HANDLE ${hdl}`, method: 'submit' }
	}

	static setEventName(hdl: number, name: string): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		assertValidNameMaxLength(name, 32, 'event name')
		return { data: `SET EVENT ${hdl} NAME ${name}`, method: 'submit' }
	}

	static setEventType(hdl: number, type: EventType): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		return { data: `SET EVENT ${hdl} TYPE ${EVENT_TYPES[type]}`, method: 'submit' }
	}

	static setEventAddress(hdl: number, addr: string): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		assertValidIPv4(addr, 'event address')
		return { data: `SET EVENT ${hdl} ADDR ${addr}`, method: 'submit' }
	}

	static setEventAddressWithPort(
		hdl: number,
		addr: string,
		port: number,
		dev: 'CLAN' | 'VLAN',
	): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		assertValidIPv4(addr, 'event address')
		assertValidRange(port, 1, 65535, 'event port')
		return { data: `SET EVENT ${hdl} ADDR ${addr} PORT ${port} DEV ${dev}`, method: 'submit' }
	}

	static setEventDataAscii(hdl: number, data: string): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		assertValidMaxLength(data, 512, 'event data')
		return { data: `SET EVENT ${hdl} DATA ${data}`, method: 'submit' }
	}

	static setEventDataHex(hdl: number, data: string): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		assertValidHexBytes(data, 512, 'event data')
		return { data: `SET EVENT ${hdl} DATA HEX ${data}`, method: 'submit' }
	}

	static setEventParams(hdl: number, params: string): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		assertValidMaxLength(params, 512, 'event params')
		return { data: `SET EVENT ${hdl} PARAMS ${params}`, method: 'submit' }
	}

	static setEventRequest(hdl: number, request: string): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		assertValidMaxLength(request, 512, 'event request')
		return { data: `SET EVENT ${hdl} REQUEST ${request}`, method: 'submit' }
	}

	static setEventResendDelay(hdl: number, dly: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		assertValidRange(dly, 0, 100, 'event resend delay')
		return { data: `SET EVENT ${hdl} RESEND DELAY ${dly}`, method: 'submit' }
	}

	static startEvent(hdl: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		return { data: `SET EVENT ${hdl} START`, method: 'submit' }
	}

	static stopEvent(hdl: number): Message & { method: 'submit' } {
		assertValidHandle(hdl, 'event handle')
		return { data: `SET EVENT ${hdl} STOP`, method: 'submit' }
	}

	static getEventStatus(): Message & { method: 'submit' } {
		return { data: 'GET EVENT STATUS', method: 'submit' }
	}

	getDanteDeviceChoices(): DropdownChoice<string>[] {
		if (!this.#dante) return []
		const devices: DropdownChoice<string>[] = []
		for (const dev of this.#dante.dante) {
			devices.push({ id: dev.name, label: `${dev.name} (${dev.priip})` })
		}
		return devices
	}

	getDecoderEncoderIpChoices(): DropdownChoice<string>[] {
		if (!this.#mxsta) return []
		const devices: DropdownChoice<string>[] = []
		for (const enc of this.#mxsta.in) {
			devices.push({ id: enc.ip, label: `ENC: ${enc.name} (${enc.ip})` })
		}
		for (const dec of this.#mxsta.out) {
			devices.push({ id: dec.ip, label: `DEC: ${dec.name} (${dec.ip})` })
		}
		return devices
	}

	getEncoderChoicesById(): DropdownChoice<number>[] {
		if (!this.#mxsta) return []
		return this.#mxsta.in.map((enc) => ({ id: enc.id, label: enc.name }))
	}

	getDecoderChoicesById(): DropdownChoice<number>[] {
		if (!this.#mxsta) return []
		return this.#mxsta.out.map((dec) => ({ id: dec.id, label: dec.name }))
	}

	// `includeEmpty` lists every valid preset handle (1-256), not just the ones the device
	// has actually reported — handles with no known preset get the label "(empty)". Useful
	// for picking a free slot to create into, rather than only choosing among existing presets.
	getDantePresetChoices(includeEmpty = false): DropdownChoice<number>[] {
		const presets = this.#dantePreset?.dante_preset ?? []
		if (!includeEmpty) {
			return presets.map((preset) => ({ id: preset.id, label: preset.name }))
		}

		const presetsById = new Map(presets.map((preset) => [preset.id, preset]))
		const choices: DropdownChoice<number>[] = []
		for (let id = 1; id <= 256; id++) {
			choices.push({ id, label: presetsById.get(id)?.name ?? '(empty)' })
		}
		return choices
	}

	// Latest parsed status from each poll, or null until the first successful poll completes.
	get dante(): ChazyDanteResponse | null {
		return this.#dante
	}

	get dantePresets(): ChazyDantePresetResponse | null {
		return this.#dantePreset
	}

	get mxsta(): ChazyMxStaResponse | null {
		return this.#mxsta
	}

	get time(): ChazyTimeResponse | null {
		return this.#time
	}

	get controlEvents(): ChazyControlEventResponse | null {
		return this.#controlEvent
	}

	get controlEventLog(): ChazyControlEventLogResponse | null {
		return this.#controlEventLog
	}
}
