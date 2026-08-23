import type ModuleInstance from './main.js'
import { createModuleLogger, type CompanionActionDefinitions } from '@companion-module/base'
import { getDeviceManagementActions, type ActionSchemaDeviceManagement } from './actions/device-management.js'
import { getDecoderControlActions, type ActionSchemaDecoderControl } from './actions/decoder-control.js'
import { getDanteControlActions, type ActionSchemaDanteControl } from './actions/dante-control.js'
import { getDantePresetControlActions, type ActionSchemaDantePresetControl } from './actions/dante-preset-control.js'
import { getEventControlActions, type ActionSchemaEventControl } from './actions/event-control.js'

export type ActionsSchema = ActionSchemaDeviceManagement &
	ActionSchemaDecoderControl &
	ActionSchemaDanteControl &
	ActionSchemaDantePresetControl &
	ActionSchemaEventControl

export function UpdateActions(self: ModuleInstance): void {
	const logger = createModuleLogger('Actions')
	const actions: CompanionActionDefinitions<ActionsSchema> = {
		...getDeviceManagementActions(self),
		...getDecoderControlActions(self),
		...getDanteControlActions(self),
		...getDantePresetControlActions(self),
		...getEventControlActions(self),
	}
	logger.info(`Setting ${Object.keys(actions).length} action definitions`)
	self.setActionDefinitions(actions)
}
