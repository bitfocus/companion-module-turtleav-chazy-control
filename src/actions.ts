import type ModuleInstance from './main.js'
import { createModuleLogger, type CompanionActionDefinitions } from '@companion-module/base'
import API from './api.js'

export enum ActionIDs {
	SetDanteSubscription = 'set_dante_subscription',
}

export type ActionsSchema = {
	[ActionIDs.SetDanteSubscription]: {
		options: {
			rxDev: string
			rxChan: number
			av: 'AUDIO' | 'VIDEO'
			txDev: string
			txChan: number
		}
		hasResult: false
	}
}

export function ensureAllActionKeys<
	TSchema extends Record<string, any>,
	TEnum extends Record<string, keyof TSchema & string>,
>(
	actions: Partial<CompanionActionDefinitions<TSchema>>,
	actionIds: TEnum,
): asserts actions is CompanionActionDefinitions<TSchema> {
	for (const key of Object.values(actionIds)) {
		if (!(key in actions)) {
			;(actions as Record<string, unknown>)[key] = undefined
		}
	}
}

export function UpdateActions(self: ModuleInstance): void {
	const logger = createModuleLogger('Actions')
	const actions: Partial<CompanionActionDefinitions<ActionsSchema>> = {}
	const danteDeviceChoices = self.chazyControl.getDanteDeviceChoices()
	actions[ActionIDs.SetDanteSubscription] = {
		name: 'Set Dante Subscription',
		options: [
			{
				id: 'rxDev',
				type: 'dropdown',
				label: 'RX Device',
				regex: '/^(?!-)(?!.*-$).{1,31}$/',
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
			{
				id: 'av',
				type: 'dropdown',
				label: 'Audio/Video',
				default: 'AUDIO',
				choices: [
					{ id: 'AUDIO', label: 'Audio' },
					{ id: 'VIDEO', label: 'Video' },
				],
				allowCustom: false,
			},
			{
				id: 'txDev',
				type: 'dropdown',
				label: 'TX Device',
				regex: '/^(?!-)(?!.*-$).{1,31}$/',
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
			await self.sendMsg(msg, context.signal)
		},
	}
	ensureAllActionKeys(actions, ActionIDs)
	logger.info(`Setting ${Object.keys(actions).length} action definitions`)
	self.setActionDefinitions(actions)
}
