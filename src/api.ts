import { EventEmitter } from 'node:events'

import { createModuleLogger, type DropdownChoice } from '@companion-module/base'
import type { Message } from './types.js'
import { ChazyDanteResponseSchema, type ChazyDanteResponse } from './schemas/dante.js'
import ModuleInstance from './main.js'

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

function assertValidIPv4(ip: string, label: string): void {
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

export interface ChazyControlEvents {
	/** Emitted whenever the dante devices found on the network change. */
	dante_device_changed: []
}

function areDeviceNameSetsEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false
	const setA = new Set(a)
	return b.every((name) => setA.has(name))
}

export default class ChazyControl extends EventEmitter<ChazyControlEvents> {
	#logger = createModuleLogger('ChazyControl')
	#instance!: ModuleInstance
	#dante: ChazyDanteResponse | null = null
	#pollTimer: NodeJS.Timeout | null = null
	#pollInterval = 10000
	#signal?: AbortSignal

	constructor(instance: ModuleInstance, pollInterval = 10000, signal?: AbortSignal) {
		super()
		this.#instance = instance
		this.#pollInterval = pollInterval
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
	}

	async #pollOnce(): Promise<void> {
		if (this.#signal?.aborted) return

		try {
			const json = await this.#instance.sendMsg(ChazyControl.getDanteDevices(), this.#signal)
			const parsed = ChazyDanteResponseSchema.parse(json)

			const newNames = parsed.dante.map((dev) => dev.name)
			const oldNames = this.#dante?.dante.map((dev) => dev.name) ?? []

			this.#dante = parsed

			if (!areDeviceNameSetsEqual(newNames, oldNames)) {
				this.emit('dante_device_changed')
			}
		} catch (err) {
			if (this.#signal?.aborted) {
				// Expected: the signal aborted mid-request (config update / destroy). Stop quietly.
				return
			}
			this.#logger.error(`Failed to poll Dante devices: ${(err as Error).message}`)
		}

		if (!this.#signal?.aborted) {
			this.#pollTimer = setTimeout(() => {
				void this.#pollOnce()
			}, this.#pollInterval)
		}
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
}
