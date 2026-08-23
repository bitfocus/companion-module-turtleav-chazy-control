import { type CompanionActionDefinitions, createModuleLogger } from '@companion-module/base'
import type ModuleInstance from '../main.js'
import API from '../api.js'
import { ensureAllActionKeys } from './utils.js'

export enum ActionIdsDeviceManagement {
	Search = 'search',
	GetSearchStatus = 'get_search_status',
	SearchReset = 'search_reset',
	AddDeviceEncoder = 'add_device_encoder',
	AddDeviceDecoder = 'add_device_decoder',
	AddDeviceReset = 'add_device_reset',
	AddAutoAll = 'add_auto_all',
}

export type ActionSchemaDeviceManagement = {
	[ActionIdsDeviceManagement.Search]: {
		options: Record<string, never>
	}
	[ActionIdsDeviceManagement.GetSearchStatus]: {
		options: Record<string, never>
	}
	[ActionIdsDeviceManagement.SearchReset]: {
		options: Record<string, never>
	}
	[ActionIdsDeviceManagement.AddDeviceEncoder]: {
		options: {
			dev: number
			enc: number
		}
	}
	[ActionIdsDeviceManagement.AddDeviceDecoder]: {
		options: {
			dev: number
			dec: number
		}
	}
	[ActionIdsDeviceManagement.AddDeviceReset]: {
		options: Record<string, never>
	}
	[ActionIdsDeviceManagement.AddAutoAll]: {
		options: Record<string, never>
	}
}

// All Device Management commands are identical on the Chazy Control (non-Pro) and Chazy Control Pro.
export function getDeviceManagementActions(
	instance: ModuleInstance,
): CompanionActionDefinitions<ActionSchemaDeviceManagement> {
	const actions: Partial<CompanionActionDefinitions<ActionSchemaDeviceManagement>> = {}
	const logger = createModuleLogger('Actions:DeviceManagement')

	actions[ActionIdsDeviceManagement.Search] = {
		name: 'Device Management - Search Encoders/Decoders',
		options: [],
		callback: async (_event, context) => {
			const msg = API.search()
			await instance.sendMsg(msg, context.signal)
		},
	}
	actions[ActionIdsDeviceManagement.GetSearchStatus] = {
		name: 'Device Management - Get Search Status',
		options: [],
		callback: async (_event, context) => {
			const msg = API.getSearchStatus()
			await instance.sendMsg(msg, context.signal)
		},
	}
	actions[ActionIdsDeviceManagement.SearchReset] = {
		name: 'Device Management - Reset Search',
		options: [],
		callback: async (_event, context) => {
			const msg = API.searchReset()
			await instance.sendMsg(msg, context.signal)
		},
	}
	actions[ActionIdsDeviceManagement.AddDeviceEncoder] = {
		name: 'Device Management - Add Encoder Device',
		options: [
			{
				id: 'dev',
				type: 'number',
				label: 'Search List Index',
				default: 1,
				min: 1,
				max: 99,
				asInteger: true,
			},
			{
				id: 'enc',
				type: 'number',
				label: 'Encoder',
				default: 1,
				min: 1,
				max: 999,
				asInteger: true,
			},
		],
		callback: async (event, context) => {
			const msg = API.addDeviceEncoder(event.options.dev, event.options.enc)
			await instance.sendMsg(msg, context.signal)
		},
	}
	actions[ActionIdsDeviceManagement.AddDeviceDecoder] = {
		name: 'Device Management - Add Decoder Device',
		options: [
			{
				id: 'dev',
				type: 'number',
				label: 'Search List Index',
				default: 1,
				min: 1,
				max: 99,
				asInteger: true,
			},
			{
				id: 'dec',
				type: 'number',
				label: 'Decoder',
				default: 1,
				min: 1,
				max: 999,
				asInteger: true,
			},
		],
		callback: async (event, context) => {
			const msg = API.addDeviceDecoder(event.options.dev, event.options.dec)
			await instance.sendMsg(msg, context.signal)
		},
	}
	actions[ActionIdsDeviceManagement.AddDeviceReset] = {
		name: 'Device Management - Reset Added Devices',
		options: [],
		callback: async (_event, context) => {
			const msg = API.addDeviceReset()
			await instance.sendMsg(msg, context.signal)
		},
	}
	actions[ActionIdsDeviceManagement.AddAutoAll] = {
		name: 'Device Management - Add All Found Devices Automatically',
		options: [],
		callback: async (_event, context) => {
			const msg = API.addAutoAll()
			await instance.sendMsg(msg, context.signal)
		},
	}

	logger.debug(`Setting ${Object.keys(actions).length} action definitions`)
	ensureAllActionKeys(actions, ActionIdsDeviceManagement)
	return actions
}
