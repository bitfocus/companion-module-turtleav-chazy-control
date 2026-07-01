import type ModuleInstance from './main.js'
import { createModuleLogger } from '@companion-module/base'

export type VariablesSchema = Record<string, never>

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const logger = createModuleLogger('Variables')
	const variables: VariablesSchema = {}
	logger.info(`Setting ${Object.keys(variables).length} variable definitions`)
	self.setVariableDefinitions(variables)
}
