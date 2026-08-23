import { type CompanionActionDefinitions, createModuleLogger, type DropdownChoice } from '@companion-module/base'
import type ModuleInstance from '../main.js'
import API, { type DecoderSwitchSignal } from '../api.js'
import { ensureAllActionKeys } from './utils.js'

export enum ActionIdsDecoderControl {
	SwitchDecoder = 'switch_decoder',
	SetDecoderUsbData = 'set_decoder_usb_data',
}

export type ActionSchemaDecoderControl = {
	[ActionIdsDecoderControl.SwitchDecoder]: {
		options: {
			dec: number
			enc: number
			signal: DecoderSwitchSignal
		}
	}
	[ActionIdsDecoderControl.SetDecoderUsbData]: {
		options: {
			dec: number
			state: 'ON' | 'OFF'
		}
	}
}

const SIGNAL_TYPE_CHOICES = [
	{ id: 'ALL', label: 'All' },
	{ id: 'VIDEO', label: 'Video' },
	{ id: 'AUDIO', label: 'Audio' },
	{ id: 'IR', label: 'IR' },
	{ id: 'RS232', label: 'RS232' },
	{ id: 'USB', label: 'USB' },
	{ id: 'CEC', label: 'CEC' },
	{ id: 'MEDIA', label: 'Media' },
] as const satisfies DropdownChoice<DecoderSwitchSignal>[]

export function getDecoderControlActions(
	instance: ModuleInstance,
): CompanionActionDefinitions<ActionSchemaDecoderControl> {
	const actions: Partial<CompanionActionDefinitions<ActionSchemaDecoderControl>> = {}
	const logger = createModuleLogger('Actions:DecoderControl')

	actions[ActionIdsDecoderControl.SwitchDecoder] = {
		name: 'Decoder - Switch',
		options: [
			{
				id: 'dec',
				type: 'number',
				label: 'Decoder',
				default: 1,
				min: 1,
				max: 999,
				asInteger: true,
			},
			{
				id: 'enc',
				type: 'number',
				label: 'Encoder',
				default: 1,
				min: 0,
				max: 999,
				asInteger: true,
				tooltip:
					'0 switches "All" to no source, or returns a single signal type (Video/Audio/IR/RS232/USB/CEC/Media) to follow mode.',
			},
			{
				id: 'signal',
				type: 'dropdown',
				label: 'Signal Type',
				default: SIGNAL_TYPE_CHOICES[0].id,
				choices: SIGNAL_TYPE_CHOICES,
				allowCustom: false,
			},
		],
		callback: async (event, context) => {
			const msg = API.switchDecoder(event.options.dec, event.options.enc, event.options.signal)
			await instance.sendMsg(msg, context.signal)
		},
	}

	actions[ActionIdsDecoderControl.SetDecoderUsbData] = {
		name: 'Decoder - USB Data',
		options: [
			{
				id: 'dec',
				type: 'number',
				label: 'Decoder',
				default: 1,
				min: 1,
				max: 999,
				asInteger: true,
			},
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
			const msg = API.setDecoderUsbData(event.options.dec, event.options.state)
			await instance.sendMsg(msg, context.signal)
		},
	}

	logger.debug(`Setting ${Object.keys(actions).length} action definitions`)
	ensureAllActionKeys(actions, ActionIdsDecoderControl)
	return actions
}
