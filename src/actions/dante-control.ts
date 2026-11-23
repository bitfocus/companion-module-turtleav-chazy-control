import {
	type CompanionActionDefinitions,
	createModuleLogger,
	type SomeCompanionActionInputField,
} from '@companion-module/base'
import type ModuleInstance from '../main.js'
import API from '../api.js'
import { ensureAllActionKeys } from './utils.js'

const NAME_REGEX = '/^(?!-)(?!.*-$).{1,31}$/'
const IPV4_REGEX = '/^(\\d{1,3}\\.){3}\\d{1,3}$/'

const DANTE_AV = ['AUDIO', 'VIDEO'] as const
type DanteAv = (typeof DANTE_AV)[number]

/** A TX channel of 0 removes the RX channel's subscription */
const TX_NONE = { id: 0, label: 'None (remove subscription)' } as const

/**
 * The option holding one device's channel for one signal type, in `Dante - Subscription (by name)`. Each device and
 * type gets its own dropdown, since each has its own channel list, and only the selected one is visible.
 *
 * Dante device names allow only letters, digits and hyphens, so swapping hyphens for underscores can't make two
 * devices share an id.
 */
export function danteChannelOptionId<TDirection extends 'rx' | 'tx'>(
	direction: TDirection,
	devname: string,
	av: DanteAv,
): `${TDirection}Chan_${string}` {
	return `${direction}Chan_${devname.replace(/[^a-zA-Z0-9_]/g, '_')}_${av.toLowerCase()}`
}

type SubscriptionByNameOptions = {
	rxDev: string
	av: DanteAv
	txDev: string
} & Partial<Record<`rxChan_${string}` | `txChan_${string}`, number>>

export enum ActionIdsDanteControl {
	SetDanteName = 'set_dante_name',
	SetDanteSampleRate = 'set_dante_sample_rate',
	SetDanteEncoding = 'set_dante_encoding',
	SetDanteTxChannelName = 'set_dante_tx_channel_name',
	AddDanteTransmitFlow = 'add_dante_transmit_flow',
	DeleteDanteTransmitFlow = 'delete_dante_transmit_flow',
	SetDanteRxChannelName = 'set_dante_rx_channel_name',
	SetDanteSubscription = 'set_dante_subscription',
	SetDanteSubscriptionByName = 'set_dante_subscription_by_name',
	SetDanteLatency = 'set_dante_latency',
	SetDantePreferred = 'set_dante_preferred',
	SetDanteAes67 = 'set_dante_aes67',
	SetDanteAes67Prefix = 'set_dante_aes67_prefix',
	ClearDanteConfig = 'clear_dante_config',
	SetDanteStaticIp = 'set_dante_static_ip',
	SetDanteDynamicIp = 'set_dante_dynamic_ip',
	RebootDanteDevice = 'reboot_dante_device',
	ClearDanteEvents = 'clear_dante_events',
	GetDanteDeviceStatus = 'get_dante_device_status',
	DanteDeviceSearch = 'dante_device_search',
}

export type ActionSchemaDanteControl = {
	[ActionIdsDanteControl.SetDanteName]: {
		options: {
			devname: string
			name: string
		}
	}
	[ActionIdsDanteControl.SetDanteSampleRate]: {
		options: {
			devname: string
			rate: string
		}
	}
	[ActionIdsDanteControl.SetDanteEncoding]: {
		options: {
			devname: string
			enc: string
		}
	}
	[ActionIdsDanteControl.SetDanteTxChannelName]: {
		options: {
			devname: string
			av: 'AUDIO' | 'VIDEO'
			chn: number
			name: string
		}
	}
	[ActionIdsDanteControl.AddDanteTransmitFlow]: {
		options: {
			devname: string
			av: 'AUDIO' | 'VIDEO'
			name: string
			id: number
			slot: string
		}
	}
	[ActionIdsDanteControl.DeleteDanteTransmitFlow]: {
		options: {
			devname: string
			av: 'AUDIO' | 'VIDEO'
			id: number
		}
	}
	[ActionIdsDanteControl.SetDanteRxChannelName]: {
		options: {
			devname: string
			av: 'AUDIO' | 'VIDEO'
			chn: number
			name: string
		}
	}
	[ActionIdsDanteControl.SetDanteSubscription]: {
		options: {
			rxDev: string
			rxChan: number
			av: 'AUDIO' | 'VIDEO'
			txDev: string
			txChan: number
		}
	}
	[ActionIdsDanteControl.SetDanteSubscriptionByName]: {
		options: SubscriptionByNameOptions
	}
	[ActionIdsDanteControl.SetDanteLatency]: {
		options: {
			devname: string
			latency: string
		}
	}
	[ActionIdsDanteControl.SetDantePreferred]: {
		options: {
			devname: string
			state: 'ON' | 'OFF'
		}
	}
	[ActionIdsDanteControl.SetDanteAes67]: {
		options: {
			devname: string
			state: 'ON' | 'OFF'
		}
	}
	[ActionIdsDanteControl.SetDanteAes67Prefix]: {
		options: {
			devname: string
			prefix: number
		}
	}
	[ActionIdsDanteControl.ClearDanteConfig]: {
		options: {
			devname: string
			mode: 'KEEPIP' | 'ALL'
		}
	}
	[ActionIdsDanteControl.SetDanteStaticIp]: {
		options: {
			devname: string
			intf: number
			ip: string
			mask: string
			gateway: string
			dns: string
		}
	}
	[ActionIdsDanteControl.SetDanteDynamicIp]: {
		options: {
			devname: string
			intf: number
		}
	}
	[ActionIdsDanteControl.RebootDanteDevice]: {
		options: {
			devname: string
			mode: 'SOFT' | 'FACTORY'
		}
	}
	[ActionIdsDanteControl.ClearDanteEvents]: {
		options: Record<string, never>
	}
	[ActionIdsDanteControl.GetDanteDeviceStatus]: {
		options: {
			devname: string
		}
	}
	[ActionIdsDanteControl.DanteDeviceSearch]: {
		options: Record<string, never>
	}
}

export function getDanteControlActions(instance: ModuleInstance): CompanionActionDefinitions<ActionSchemaDanteControl> {
	const actions: Partial<CompanionActionDefinitions<ActionSchemaDanteControl>> = {}
	const logger = createModuleLogger('Actions:DanteControl')
	// A handful of Dante Control commands (PREFERRED, AES67, CLEAR CONFIG, static/dynamic IP, REBOOT,
	// and dante event clear) only exist on Chazy Control Pro - see the per-action comments below.
	const isPro = instance.config.model === 'chazy control pro'
	const danteDeviceChoices = instance.chazyControl.getDanteDeviceChoices()
	const danteDeviceOption = {
		id: 'devname' as const,
		type: 'dropdown' as const,
		label: 'Dante Device',
		regex: NAME_REGEX,
		choices: danteDeviceChoices,
		default: danteDeviceChoices[0]?.id ?? '',
		allowCustom: true,
	}
	const avOption = {
		id: 'av' as const,
		type: 'dropdown' as const,
		label: 'Audio/Video',
		default: 'AUDIO',
		choices: [
			{ id: 'AUDIO', label: 'Audio' },
			{ id: 'VIDEO', label: 'Video' },
		],
		allowCustom: false,
	}

	/**
	 * A channel dropdown per device and signal type, shown only while that device and type are selected.
	 *
	 * An RX dropdown is left out where the device has no such channels: a dropdown with no choices can never hold a
	 * valid value. Every device gets TX dropdowns, as None is always a choice, and removing a subscription only needs
	 * a valid TX device name.
	 */
	function subscriptionChannelOptions(
		direction: 'rx' | 'tx',
	): SomeCompanionActionInputField<keyof SubscriptionByNameOptions & string>[] {
		const fields: SomeCompanionActionInputField<keyof SubscriptionByNameOptions & string>[] = []
		for (const av of DANTE_AV) {
			for (const { id: devname } of danteDeviceChoices) {
				const channels = instance.chazyControl.getDanteChannelChoices(devname, direction, av)
				if (direction === 'rx' && channels.length === 0) continue

				const choices = direction === 'rx' ? channels : [TX_NONE, ...channels]
				fields.push({
					id: danteChannelOptionId(direction, devname, av),
					type: 'dropdown',
					label: direction === 'rx' ? 'RX Channel' : 'TX Channel',
					choices,
					// the device's first channel, or None for a TX device with no channels of this type
					default: channels[0]?.id ?? TX_NONE.id,
					allowCustom: false,
					isVisibleExpression: `$(options:${direction}Dev) == '${devname}' && $(options:av) == '${av}'`,
				})
			}
		}
		return fields
	}

	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.SetDanteName] = {
		name: 'Dante - Device Name',
		options: [
			danteDeviceOption,
			{
				id: 'name',
				type: 'textinput',
				label: 'New Name',
				regex: NAME_REGEX,
				default: '',
			},
		],
		callback: async (event, context) => {
			const msg = API.setDanteName(event.options.devname, event.options.name)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.SetDanteSampleRate] = {
		name: 'Dante - Sample Rate',
		options: [
			danteDeviceOption,
			{
				id: 'rate',
				type: 'textinput',
				label: 'Sample Rate',
				default: '',
				tooltip: 'Use "Dante - Get Device Status" to see the sample rates supported by this device.',
			},
		],
		callback: async (event, context) => {
			const msg = API.setDanteSampleRate(event.options.devname, event.options.rate)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.SetDanteEncoding] = {
		name: 'Dante - Encoding',
		options: [
			danteDeviceOption,
			{
				id: 'enc',
				type: 'textinput',
				label: 'Encoding',
				default: '',
				tooltip: 'Use "Dante - Get Device Status" to see the encodings supported by this device.',
			},
		],
		callback: async (event, context) => {
			const msg = API.setDanteEncoding(event.options.devname, event.options.enc)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.SetDanteTxChannelName] = {
		name: 'Dante - TX Channel Name',
		options: [
			danteDeviceOption,
			avOption,
			{
				id: 'chn',
				type: 'number',
				label: 'TX Channel',
				default: 1,
				min: 1,
				max: 512,
				asInteger: true,
			},
			{
				id: 'name',
				type: 'textinput',
				label: 'Channel Name',
				regex: NAME_REGEX,
				default: '',
			},
		],
		callback: async (event, context) => {
			const msg = API.setDanteTxChannelName(
				event.options.devname,
				event.options.av,
				event.options.chn,
				event.options.name,
			)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.AddDanteTransmitFlow] = {
		name: 'Dante - Add Transmit Flow',
		options: [
			danteDeviceOption,
			avOption,
			{
				id: 'name',
				type: 'textinput',
				label: 'Flow Name',
				regex: NAME_REGEX,
				default: '',
			},
			{
				id: 'id',
				type: 'number',
				label: 'Multicast Flow ID',
				default: 1,
				min: 1,
				max: 999999,
				asInteger: true,
			},
			{
				id: 'slot',
				type: 'textinput',
				label: 'Transmit Channel IDs',
				regex: '/^\\d+(:\\d+)*$/',
				default: '1',
				tooltip: 'Colon-separated list of transmit channel IDs, e.g. 1:2:3',
			},
		],
		callback: async (event, context) => {
			const msg = API.addDanteTransmitFlow(
				event.options.devname,
				event.options.av,
				event.options.name,
				event.options.id,
				event.options.slot,
			)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.DeleteDanteTransmitFlow] = {
		name: 'Dante - Delete Transmit Flow',
		options: [
			danteDeviceOption,
			avOption,
			{
				id: 'id',
				type: 'number',
				label: 'Multicast Flow ID',
				default: 1,
				min: 1,
				max: 999999,
				asInteger: true,
			},
		],
		callback: async (event, context) => {
			const msg = API.deleteDanteTransmitFlow(event.options.devname, event.options.av, event.options.id)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.SetDanteRxChannelName] = {
		name: 'Dante - RX Channel Name',
		options: [
			danteDeviceOption,
			avOption,
			{
				id: 'chn',
				type: 'number',
				label: 'RX Channel',
				default: 1,
				min: 1,
				max: 512,
				asInteger: true,
			},
			{
				id: 'name',
				type: 'textinput',
				label: 'Channel Name',
				regex: NAME_REGEX,
				default: '',
			},
		],
		callback: async (event, context) => {
			const msg = API.setDanteRxChannelName(
				event.options.devname,
				event.options.av,
				event.options.chn,
				event.options.name,
			)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.SetDanteSubscription] = {
		name: 'Dante - Subscription',
		options: [
			{
				id: 'rxDev',
				type: 'dropdown',
				label: 'RX Device',
				regex: NAME_REGEX,
				choices: danteDeviceChoices,
				default: danteDeviceChoices[0]?.id ?? '',
				allowCustom: true,
			},
			{
				id: 'rxChan',
				type: 'number',
				label: 'RX Channel',
				default: 1,
				min: 1,
				max: 512,
				asInteger: true,
			},
			avOption,
			{
				id: 'txDev',
				type: 'dropdown',
				label: 'TX Device',
				regex: NAME_REGEX,
				choices: danteDeviceChoices,
				default: danteDeviceChoices[0]?.id ?? '',
				allowCustom: true,
			},
			{
				id: 'txChan',
				type: 'number',
				label: 'TX Channel',
				default: 1,
				min: 0,
				max: 512,
				asInteger: true,
				description: 'Set to 0 to remove subscription from RX device (TX Device name must still be valid).',
			},
		],
		callback: async (event, context) => {
			const msg = API.setDanteSubscription(
				event.options.rxDev,
				event.options.rxChan,
				event.options.av,
				event.options.txDev,
				event.options.txChan,
			)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.SetDanteSubscriptionByName] = {
		name: 'Dante - Subscription (by name)',
		description: 'As Dante - Subscription, but picking each channel by name from those the device reports.',
		options: [
			{
				id: 'rxDev',
				type: 'dropdown',
				label: 'RX Device',
				choices: danteDeviceChoices,
				default: danteDeviceChoices[0]?.id ?? '',
				allowCustom: false,
				// required: the channel dropdowns' isVisibleExpression reads this option
				disableAutoExpression: true,
			},
			...subscriptionChannelOptions('rx'),
			{
				...avOption,
				// required: the channel dropdowns' isVisibleExpression reads this option
				disableAutoExpression: true,
			},
			{
				id: 'txDev',
				type: 'dropdown',
				label: 'TX Device',
				choices: danteDeviceChoices,
				default: danteDeviceChoices[0]?.id ?? '',
				allowCustom: false,
				// required: the channel dropdowns' isVisibleExpression reads this option
				disableAutoExpression: true,
			},
			...subscriptionChannelOptions('tx'),
		],
		callback: async (event, context) => {
			const { rxDev, av, txDev } = event.options
			const rxChan = event.options[danteChannelOptionId('rx', rxDev, av)]
			const txChan = event.options[danteChannelOptionId('tx', txDev, av)]
			// Unset when the device or channel appeared after the action was last edited. Sending a guess could
			// reroute the wrong channel, so refuse instead.
			if (rxChan === undefined) throw new Error(`No ${av} RX channel selected for ${rxDev}`)
			if (txChan === undefined) throw new Error(`No ${av} TX channel selected for ${txDev}`)

			const msg = API.setDanteSubscription(rxDev, rxChan, av, txDev, txChan)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.SetDanteLatency] = {
		name: 'Dante - Latency',
		options: [
			danteDeviceOption,
			{
				id: 'latency',
				type: 'textinput',
				label: 'Latency',
				default: '',
				tooltip: 'Use "Dante - Get Device Status" to see the latencies supported by this device.',
			},
		],
		callback: async (event, context) => {
			const msg = API.setDanteLatency(event.options.devname, event.options.latency)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Chazy Control Pro only - no equivalent commands on the (non-Pro) Chazy Control
	if (isPro) {
		actions[ActionIdsDanteControl.SetDantePreferred] = {
			name: 'Dante - Preferred',
			options: [
				danteDeviceOption,
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'ON',
					choices: [
						{ id: 'ON', label: 'On' },
						{ id: 'OFF', label: 'Off' },
					],
					allowCustom: false,
				},
			],
			callback: async (event, context) => {
				const msg = API.setDantePreferred(event.options.devname, event.options.state)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDanteControl.SetDanteAes67] = {
			name: 'Dante - AES67',
			options: [
				danteDeviceOption,
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'ON',
					choices: [
						{ id: 'ON', label: 'On' },
						{ id: 'OFF', label: 'Off' },
					],
					allowCustom: false,
				},
			],
			callback: async (event, context) => {
				const msg = API.setDanteAes67(event.options.devname, event.options.state)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDanteControl.SetDanteAes67Prefix] = {
			name: 'Dante - AES67 Prefix',
			options: [
				danteDeviceOption,
				{
					id: 'prefix',
					type: 'number',
					label: 'AES67 Prefix',
					default: 0,
					min: 0,
					max: 255,
					asInteger: true,
				},
			],
			callback: async (event, context) => {
				const msg = API.setDanteAes67Prefix(event.options.devname, event.options.prefix)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDanteControl.ClearDanteConfig] = {
			name: 'Dante - Clear Configuration',
			options: [
				danteDeviceOption,
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'KEEPIP',
					choices: [
						{ id: 'KEEPIP', label: 'Keep IP' },
						{ id: 'ALL', label: 'All' },
					],
					allowCustom: false,
				},
			],
			callback: async (event, context) => {
				const msg = API.clearDanteConfig(event.options.devname, event.options.mode)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDanteControl.SetDanteStaticIp] = {
			name: 'Dante - Static IP',
			options: [
				danteDeviceOption,
				{
					id: 'intf',
					type: 'number',
					label: 'Interface',
					default: 1,
					min: 1,
					max: 2,
					asInteger: true,
					tooltip: 'Primary (1) or Secondary (2) Dante network interface.',
				},
				{
					id: 'ip',
					type: 'textinput',
					label: 'IP Address',
					regex: IPV4_REGEX,
					default: '0.0.0.0',
				},
				{
					id: 'mask',
					type: 'textinput',
					label: 'Subnet Mask',
					regex: IPV4_REGEX,
					default: '255.255.255.0',
				},
				{
					id: 'gateway',
					type: 'textinput',
					label: 'Gateway',
					regex: IPV4_REGEX,
					default: '0.0.0.0',
				},
				{
					id: 'dns',
					type: 'textinput',
					label: 'DNS',
					regex: IPV4_REGEX,
					default: '0.0.0.0',
				},
			],
			callback: async (event, context) => {
				const msg = API.setDanteStaticIp(
					event.options.devname,
					event.options.intf,
					event.options.ip,
					event.options.mask,
					event.options.gateway,
					event.options.dns,
				)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDanteControl.SetDanteDynamicIp] = {
			name: 'Dante - Dynamic IP (DHCP)',
			options: [
				danteDeviceOption,
				{
					id: 'intf',
					type: 'number',
					label: 'Interface',
					default: 1,
					min: 1,
					max: 2,
					asInteger: true,
					tooltip: 'Primary (1) or Secondary (2) Dante network interface.',
				},
			],
			callback: async (event, context) => {
				const msg = API.setDanteDynamicIp(event.options.devname, event.options.intf)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDanteControl.RebootDanteDevice] = {
			name: 'Dante - Reboot Device',
			options: [
				danteDeviceOption,
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					default: 'SOFT',
					choices: [
						{ id: 'SOFT', label: 'Soft' },
						{ id: 'FACTORY', label: 'Factory' },
					],
					allowCustom: false,
				},
			],
			callback: async (event, context) => {
				const msg = API.rebootDanteDevice(event.options.devname, event.options.mode)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDanteControl.ClearDanteEvents] = {
			name: 'Dante - Clear Events',
			options: [],
			callback: async (_event, context) => {
				const msg = API.clearDanteEvents()
				await instance.sendMsg(msg, context.signal)
			},
		}
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.GetDanteDeviceStatus] = {
		name: 'Dante - Get Device Status',
		options: [danteDeviceOption],
		callback: async (event, context) => {
			const msg = API.getDanteDeviceStatus(event.options.devname)
			await instance.sendMsg(msg, context.signal)
		},
	}
	// Supported on Chazy Control (non-Pro)
	actions[ActionIdsDanteControl.DanteDeviceSearch] = {
		name: 'Dante - Search Devices',
		options: [],
		callback: async (_event, context) => {
			const msg = API.danteDeviceSearch()
			await instance.sendMsg(msg, context.signal)
		},
	}

	logger.debug(`Setting ${Object.keys(actions).length} action definitions`)
	ensureAllActionKeys(actions, ActionIdsDanteControl)
	return actions
}
