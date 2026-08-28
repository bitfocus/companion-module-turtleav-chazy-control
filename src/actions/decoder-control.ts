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
	const decoderChoices = instance.chazyControl.getDecoderChoicesById()
	const encoderChoices: DropdownChoice<number>[] = [
		{ id: 0, label: 'None (No Source / Follow Mode)' },
		...instance.chazyControl.getEncoderChoicesById(),
	]
	const decoderOption = {
		id: 'dec' as const,
		type: 'dropdown' as const,
		label: 'Decoder',
		choices: decoderChoices,
		default: decoderChoices[0]?.id ?? 1,
	}

	actions[ActionIdsDecoderControl.SwitchDecoder] = {
		name: 'Decoder - Switch',
		options: [
			decoderOption,
			{
				id: 'enc',
				type: 'dropdown',
				label: 'Encoder',
				choices: encoderChoices,
				default: 0,
				tooltip:
					'None (0) switches "All" to no source, or returns a single signal type (Video/Audio/IR/RS232/USB/CEC/Media) to follow mode.',
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
			decoderOption,
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
