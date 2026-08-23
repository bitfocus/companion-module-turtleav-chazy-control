import { type CompanionActionDefinitions, type DropdownChoice, createModuleLogger } from '@companion-module/base'
import type ModuleInstance from '../main.js'
import API, { EVENT_TYPES, type EventType } from '../api.js'
import { ensureAllActionKeys } from './utils.js'

const IPV4_REGEX = '/^(\\d{1,3}\\.){3}\\d{1,3}$/'

const EVENT_HANDLE_OPTION = {
	id: 'hdl' as const,
	type: 'number' as const,
	label: 'Event Handle',
	default: 1,
	min: 1,
	max: 256,
	asInteger: true,
}

const EVENT_TYPE_CHOICES: DropdownChoice<EventType>[] = (Object.keys(EVENT_TYPES) as EventType[]).map((type) => ({
	id: type,
	label: type.replace('_', ' '),
}))

export enum ActionIdsEventControl {
	CreateEvent = 'create_event',
	DeleteEvent = 'delete_event',
	SetEventName = 'set_event_name',
	SetEventType = 'set_event_type',
	SetEventAddress = 'set_event_address',
	SetEventAddressWithPort = 'set_event_address_with_port',
	SetEventDataAscii = 'set_event_data_ascii',
	SetEventDataHex = 'set_event_data_hex',
	SetEventParams = 'set_event_params',
	SetEventRequest = 'set_event_request',
	SetEventResendDelay = 'set_event_resend_delay',
	StartEvent = 'start_event',
	StopEvent = 'stop_event',
	GetEventStatus = 'get_event_status',
}

export type ActionSchemaEventControl = {
	[ActionIdsEventControl.CreateEvent]: {
		options: {
			hdl: number
		}
	}
	[ActionIdsEventControl.DeleteEvent]: {
		options: {
			hdl: number
		}
	}
	[ActionIdsEventControl.SetEventName]: {
		options: {
			hdl: number
			name: string
		}
	}
	[ActionIdsEventControl.SetEventType]: {
		options: {
			hdl: number
			type: EventType
		}
	}
	[ActionIdsEventControl.SetEventAddress]: {
		options: {
			hdl: number
			addr: string
		}
	}
	[ActionIdsEventControl.SetEventAddressWithPort]: {
		options: {
			hdl: number
			addr: string
			port: number
			dev: 'CLAN' | 'VLAN'
		}
	}
	[ActionIdsEventControl.SetEventDataAscii]: {
		options: {
			hdl: number
			data: string
		}
	}
	[ActionIdsEventControl.SetEventDataHex]: {
		options: {
			hdl: number
			data: string
		}
	}
	[ActionIdsEventControl.SetEventParams]: {
		options: {
			hdl: number
			params: string
		}
	}
	[ActionIdsEventControl.SetEventRequest]: {
		options: {
			hdl: number
			request: string
		}
	}
	[ActionIdsEventControl.SetEventResendDelay]: {
		options: {
			hdl: number
			dly: number
		}
	}
	[ActionIdsEventControl.StartEvent]: {
		options: {
			hdl: number
		}
	}
	[ActionIdsEventControl.StopEvent]: {
		options: {
			hdl: number
		}
	}
	[ActionIdsEventControl.GetEventStatus]: {
		options: Record<string, never>
	}
}

export function getEventControlActions(instance: ModuleInstance): CompanionActionDefinitions<ActionSchemaEventControl> {
	const actions: Partial<CompanionActionDefinitions<ActionSchemaEventControl>> = {}
	const logger = createModuleLogger('Actions:EventControl')

	// Chazy Control Pro only - the (non-Pro) Chazy Control API has no Event Control commands.
	if (instance.config.model === 'chazy control pro') {
		actions[ActionIdsEventControl.CreateEvent] = {
			name: 'Event - Create',
			options: [EVENT_HANDLE_OPTION],
			callback: async (event, context) => {
				const msg = API.createEvent(event.options.hdl)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.DeleteEvent] = {
			name: 'Event - Delete',
			options: [EVENT_HANDLE_OPTION],
			callback: async (event, context) => {
				const msg = API.deleteEvent(event.options.hdl)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventName] = {
			name: 'Event - Name',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'name',
					type: 'textinput',
					label: 'Name',
					default: '',
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventName(event.options.hdl, event.options.name)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventType] = {
			name: 'Event - Type',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'type',
					type: 'dropdown',
					label: 'Type',
					default: EVENT_TYPE_CHOICES[0]?.id ?? 'IR',
					choices: EVENT_TYPE_CHOICES,
					allowCustom: false,
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventType(event.options.hdl, event.options.type)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventAddress] = {
			name: 'Event - Address',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'addr',
					type: 'textinput',
					label: 'Address',
					regex: IPV4_REGEX,
					default: '0.0.0.0',
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventAddress(event.options.hdl, event.options.addr)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventAddressWithPort] = {
			name: 'Event - Address With Port',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'addr',
					type: 'textinput',
					label: 'Address',
					regex: IPV4_REGEX,
					default: '0.0.0.0',
				},
				{
					id: 'port',
					type: 'number',
					label: 'Port',
					default: 80,
					min: 1,
					max: 65535,
					asInteger: true,
				},
				{
					id: 'dev',
					type: 'dropdown',
					label: 'Network',
					default: 'CLAN',
					choices: [
						{ id: 'CLAN', label: 'Control LAN' },
						{ id: 'VLAN', label: 'Video LAN' },
					],
					allowCustom: false,
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventAddressWithPort(
					event.options.hdl,
					event.options.addr,
					event.options.port,
					event.options.dev,
				)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventDataAscii] = {
			name: 'Event - Data (ASCII)',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'data',
					type: 'textinput',
					label: 'Data',
					default: '',
					tooltip: 'Max 512 bytes',
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventDataAscii(event.options.hdl, event.options.data)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventDataHex] = {
			name: 'Event - Data (HEX)',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'data',
					type: 'textinput',
					label: 'Data',
					regex: '/^[0-9A-Fa-f]{2}(\\s[0-9A-Fa-f]{2})*$/',
					default: '00',
					tooltip: 'Space-separated hex bytes, e.g. 01 02 0A. Max 512 bytes',
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventDataHex(event.options.hdl, event.options.data)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventParams] = {
			name: 'Event - Params',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'params',
					type: 'textinput',
					label: 'Params',
					default: '',
					tooltip: 'Max 512 bytes',
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventParams(event.options.hdl, event.options.params)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventRequest] = {
			name: 'Event - Request',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'request',
					type: 'textinput',
					label: 'Request',
					default: '',
					tooltip: 'Max 512 bytes',
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventRequest(event.options.hdl, event.options.request)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.SetEventResendDelay] = {
			name: 'Event - Resend Delay',
			options: [
				EVENT_HANDLE_OPTION,
				{
					id: 'dly',
					type: 'number',
					label: 'Delay (seconds)',
					default: 0,
					min: 0,
					max: 100,
					asInteger: true,
				},
			],
			callback: async (event, context) => {
				const msg = API.setEventResendDelay(event.options.hdl, event.options.dly)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.StartEvent] = {
			name: 'Event - Start',
			options: [EVENT_HANDLE_OPTION],
			callback: async (event, context) => {
				const msg = API.startEvent(event.options.hdl)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.StopEvent] = {
			name: 'Event - Stop',
			options: [EVENT_HANDLE_OPTION],
			callback: async (event, context) => {
				const msg = API.stopEvent(event.options.hdl)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsEventControl.GetEventStatus] = {
			name: 'Event - Get Status',
			options: [],
			callback: async (_event, context) => {
				const msg = API.getEventStatus()
				await instance.sendMsg(msg, context.signal)
			},
		}
	}

	logger.debug(`Setting ${Object.keys(actions).length} action definitions`)
	ensureAllActionKeys(actions, ActionIdsEventControl)
	return actions
}
