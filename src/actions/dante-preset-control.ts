import { type CompanionActionDefinitions, createModuleLogger } from '@companion-module/base'
import type ModuleInstance from '../main.js'
import API from '../api.js'
import { ensureAllActionKeys } from './utils.js'

const PRESET_HANDLE_OPTION = {
	id: 'hdl' as const,
	type: 'number' as const,
	label: 'Preset Handle',
	default: 1,
	min: 1,
	max: 256,
	asInteger: true,
}

export enum ActionIdsDantePresetControl {
	CreateDantePreset = 'create_dante_preset',
	DeleteDantePreset = 'delete_dante_preset',
	SetDantePresetName = 'set_dante_preset_name',
	ApplyDantePreset = 'apply_dante_preset',
	GetDantePresetStatus = 'get_dante_preset_status',
}

export type ActionSchemaDantePresetControl = {
	[ActionIdsDantePresetControl.CreateDantePreset]: {
		options: {
			hdl: number
		}
	}
	[ActionIdsDantePresetControl.DeleteDantePreset]: {
		options: {
			hdl: number
		}
	}
	[ActionIdsDantePresetControl.SetDantePresetName]: {
		options: {
			hdl: number
			name: string
		}
	}
	[ActionIdsDantePresetControl.ApplyDantePreset]: {
		options: {
			hdl: number
		}
	}
	[ActionIdsDantePresetControl.GetDantePresetStatus]: {
		options: {
			hdl: number
		}
	}
}

export function getDantePresetControlActions(
	instance: ModuleInstance,
): CompanionActionDefinitions<ActionSchemaDantePresetControl> {
	const actions: Partial<CompanionActionDefinitions<ActionSchemaDantePresetControl>> = {}
	const logger = createModuleLogger('Actions:DantePresetControl')

	// Chazy Control Pro only - the (non-Pro) Chazy Control API has no Dante Preset commands.
	if (instance.config.model === 'chazy control pro') {
		actions[ActionIdsDantePresetControl.CreateDantePreset] = {
			name: 'Dante Preset - Create',
			options: [PRESET_HANDLE_OPTION],
			callback: async (event, context) => {
				const msg = API.createDantePreset(event.options.hdl)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDantePresetControl.DeleteDantePreset] = {
			name: 'Dante Preset - Delete',
			options: [PRESET_HANDLE_OPTION],
			callback: async (event, context) => {
				const msg = API.deleteDantePreset(event.options.hdl)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDantePresetControl.SetDantePresetName] = {
			name: 'Dante Preset - Name',
			options: [
				PRESET_HANDLE_OPTION,
				{
					id: 'name',
					type: 'textinput',
					label: 'Preset Name',
					regex: '/^.{1,32}$/',
					default: '',
				},
			],
			callback: async (event, context) => {
				const msg = API.setDantePresetName(event.options.hdl, event.options.name)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDantePresetControl.ApplyDantePreset] = {
			name: 'Dante Preset - Apply',
			options: [PRESET_HANDLE_OPTION],
			callback: async (event, context) => {
				const msg = API.applyDantePreset(event.options.hdl)
				await instance.sendMsg(msg, context.signal)
			},
		}
		actions[ActionIdsDantePresetControl.GetDantePresetStatus] = {
			name: 'Dante Preset - Get Status',
			options: [PRESET_HANDLE_OPTION],
			callback: async (event, context) => {
				const msg = API.getDantePresetStatus(event.options.hdl)
				await instance.sendMsg(msg, context.signal)
			},
		}
	}

	logger.debug(`Setting ${Object.keys(actions).length} action definitions`)
	ensureAllActionKeys(actions, ActionIdsDantePresetControl)
	return actions
}
