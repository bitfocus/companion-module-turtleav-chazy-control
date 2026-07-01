import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import type { Message } from './types.js'
import ChazyControl from './api.js'
import PQueue from 'p-queue'
import { request } from 'undici'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	public config!: ModuleConfig // Setup in init()
	#queue = new PQueue({ concurrency: 1, autoStart: true, interval: 10, intervalCap: 1, strict: true })
	#controller = new AbortController()
	public chazyControl: ChazyControl = new ChazyControl(this, 10000, this.#controller.signal)

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateStatus(InstanceStatus.Connecting)

		void this.configUpdated(config)
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.id}:${this.label}`)
		this.#controller.abort('Destroying module')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.#controller.abort('Config Updated')
		this.#controller = new AbortController()
		this.#queue.clear()
		this.chazyControl = new ChazyControl(this, 10000, this.#controller.signal)
		this.chazyControl.on('dante_device_changed', () => {
			this.updateCompanionBits()
		})
		this.updateStatus(InstanceStatus.Ok)
		this.updateCompanionBits()

		this.chazyControl.startPolling()
	}

	// Return config fields for web config
	public getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	private updateCompanionBits(): void {
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updatePresets() // export Presets
		this.updateVariableDefinitions() // export variable definitions
	}

	public async sendMsg(msg: Message & { method: 'get' }, signal?: AbortSignal): Promise<Record<string, unknown>>
	public async sendMsg(msg: Message & { method: 'submit' }, signal?: AbortSignal): Promise<string | undefined>
	public async sendMsg(msg: Message, signal?: AbortSignal): Promise<Record<string, unknown> | string | undefined> {
		const combinedSignal = signal ? AbortSignal.any([signal, this.#controller.signal]) : this.#controller.signal

		const response = await this.#queue.add(
			async ({ signal: taskSignal }) => {
				let path = `http://${this.config.host}:${this.config.port}/cgi-bin/`
				switch (msg.method) {
					case 'get':
						path += 'getjson.cgi?json='
						break
					case 'submit':
						path += 'submit?cmd='
						break
					default: {
						const _exhaustive: never = msg.method
						throw new Error(`Unhandled method type: ${_exhaustive}`)
					}
				}
				path += msg.data
				this.log('debug', `Sending: ${path}`)
				const { statusCode, body } = await request(path, {
					method: 'GET',
					signal: taskSignal,
					headers: {
						Accept: 'application/json, text/plain, */*',
						Connection: 'keep-alive',
						'Content-Type': 'application/json',
						Cookie: `type=admin; user=${this.config.user}; ctrloutput=all; canselinput=all; canselpreset=0,1,2,3,4,5,6,7; ctrlfun=X; mx_icon_sort=X; mx_tab_sort=X`, // TODO: Confirm which parts are necessary
					},
				})
				if (statusCode < 200 || statusCode >= 300) {
					await body.dump() // drain without parsing
					throw new Error(`Unexpected status ${statusCode} for path: ${path}`)
				}

				const text = await body.text()

				if (msg.method === 'get') {
					if (text.length === 0) {
						throw new Error(`Expected JSON response from ${path} but body was empty`)
					}
					try {
						return JSON.parse(text)
					} catch (err) {
						throw new Error(`Failed to parse JSON from ${path}: ${(err as Error).message}. Body: ${text}`, {
							cause: err,
						})
					}
				}

				// submit — normally empty; log and return if the device says something back
				if (text.length > 0) {
					this.log('debug', `Unexpected response body from submit: ${text}`)
					return text
				}

				return undefined
			},
			{ signal: combinedSignal },
		)

		return response
	}

	private updateActions(): void {
		UpdateActions(this)
	}

	private updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	private updatePresets(): void {
		UpdatePresets(this)
	}

	private updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}
