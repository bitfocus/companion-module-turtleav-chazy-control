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
import { Agent, request } from 'undici'
import { debounce } from 'es-toolkit'

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
	#dispatcher: Agent | undefined
	public chazyControl: ChazyControl = new ChazyControl(this, 10000, 10000, this.#controller.signal)
	// dante/encoder/decoder device-changed events can all fire out of the same poll cycle —
	// debounce so a burst of them only triggers one rebuild instead of one per event.
	#debouncedUpdateCompanionBits = debounce(() => this.updateCompanionBits(), 1000)

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		this.updateDispatcher()

		this.updateStatus(InstanceStatus.Connecting)

		void this.configUpdated(config)
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', `destroy ${this.id}:${this.label}`)
		this.#controller.abort('Destroying module')
		await this.#dispatcher?.close()
		this.#dispatcher = undefined
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		// Global to the whole Node process, not just this module's own requests — some
		// TLS paths outside undici's own dispatcher may still fall back to this.
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = config.allowInsecure ? '0' : '1'
		this.updateDispatcher()
		this.#controller.abort('Config Updated')
		this.#controller = new AbortController()
		this.#queue.clear()

		// Carry forward which feedbacks were expecting image polling, so replacing
		// chazyControl doesn't silently stop their polling until Companion happens to
		// recheck them for some other reason.
		const previousFeedbacksToPoll = this.chazyControl.getFeedbacksToPoll()
		this.chazyControl = new ChazyControl(this, 10000, this.config.imageInterval, this.#controller.signal)
		for (const feedbackId of previousFeedbacksToPoll) {
			this.chazyControl.addFeedbackToPoll(feedbackId)
		}

		this.chazyControl.on('dante_device_changed', () => this.#debouncedUpdateCompanionBits())
		this.chazyControl.on('encoder_device_changed', () => this.#debouncedUpdateCompanionBits())
		this.chazyControl.on('decoder_device_changed', () => this.#debouncedUpdateCompanionBits())
		this.chazyControl.on('dante_preset_changed', () => this.#debouncedUpdateCompanionBits())
		this.updateStatus(InstanceStatus.Ok)
		this.updateCompanionBits()

		this.chazyControl.startPolling()
	}

	// Rebuilds the undici dispatcher for the current config. Only needed to opt out of TLS
	// verification — otherwise `undefined` leaves undici on its global dispatcher.
	private updateDispatcher(): void {
		const previous = this.#dispatcher
		this.#dispatcher =
			this.config.protocol === 'https' && this.config.allowInsecure
				? new Agent({ connect: { rejectUnauthorized: false } })
				: undefined
		void previous?.close()
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
	public async sendMsg(msg: Message & { method: 'capture' }, signal?: AbortSignal): Promise<Buffer>
	public async sendMsg(
		msg: Message,
		signal?: AbortSignal,
	): Promise<Record<string, unknown> | string | undefined | Buffer> {
		const combinedSignal = signal ? AbortSignal.any([signal, this.#controller.signal]) : this.#controller.signal

		const response = await this.#queue.add(
			async ({ signal: taskSignal }) => {
				let path = `${this.config.protocol}://${this.config.host}/cgi-bin/`
				switch (msg.method) {
					case 'get':
						path += 'getjson.cgi?json=' + msg.data
						break
					case 'submit':
						path += 'submit?cmd=' + msg.data
						break
					case 'capture':
						path += 'capture.cgi?hostip='
						path += msg.ip
						path += '&capwidth='
						path += msg.width
						path += '&time='
						path += Date.now()
						break
					default: {
						const _exhaustive: never = msg
						throw new Error(`Unhandled method type: ${JSON.stringify(_exhaustive)}`)
					}
				}

				this.log('debug', `Sending: ${path}`)
				const { statusCode, body } = await request(path, {
					method: 'GET',
					signal: taskSignal,
					dispatcher: this.#dispatcher,
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

				if (msg.method === 'capture') {
					const captureBuffer = Buffer.from(await body.arrayBuffer())
					if (captureBuffer.length === 0) {
						// The device returns 200 + Content-Type: image/jpeg with an empty body when
						// it has nothing to capture (e.g. no active video signal on that encoder).
						throw new Error(`Empty capture response from ${path} — device likely has no active signal`)
					}
					return captureBuffer
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

	// Thin pass-throughs — the actual polling and cache live on chazyControl, since it
	// already owns the device-polling lifecycle (recreated on config updates, torn down
	// on the same AbortSignal). Kept here so feedback callbacks only need `instance`.
	public addFeedbackToPoll(feedbackId: string): void {
		this.chazyControl.addFeedbackToPoll(feedbackId)
	}

	public removeFeedbackToPoll(feedbackId: string): void {
		this.chazyControl.removeFeedbackToPoll(feedbackId)
	}

	public async getCapturePreview(ip: string, width: number): Promise<string> {
		return this.chazyControl.getCapturePreview(ip, width)
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
