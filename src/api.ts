import { EventEmitter } from 'node:events'

import { createModuleLogger, type DropdownChoice } from '@companion-module/base'
import type { Message } from './types.js'
import { ChazyDanteResponseSchema, type ChazyDanteResponse } from './schemas/dante.js'
import ModuleInstance from './main.js'

function assertValidChannel(chan: number): void {
	if (chan < 0 || !Number.isInteger(chan)) throw new Error(`Invalid channel ${chan}`)
}

function validateDevName(name: string): string {
	const validName = name.substring(0, 31).trim()
	if (validName.startsWith('-') || validName.endsWith('-')) throw new Error(`Invalid device name ${name}`)
	return validName
}

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
			validateDevName(rxDev) + ' ' + av + ' RXCHN ' + rxChan + ' SOURCE ' + validateDevName(txDev) + ' CHN ' + txChan
		return msg
	}

	static getDanteDevices(): Message & { method: 'get' } {
		return { data: 'dante', method: 'get' }
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
