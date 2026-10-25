import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ConnectionVariable, ModuleConfig } from './config.js'

/**
 * `variables`, a checkbox meaning "create module variables", became `connectionVariables`, a multidropdown choosing
 * which sets to keep. A ticked box produced a variable per encoder, decoder and Dante device, so it maps to those
 * three. Dante Subscriptions did not exist then and is left off, since enabling it would add variables the user never
 * asked for.
 */
const connectionVariablesFromCheckbox: CompanionStaticUpgradeScript<ModuleConfig, undefined> = (_context, props) => {
	// `variables` is not on ModuleConfig any more, but reaches us through its JsonObject index signature
	const config = props.config
	const result = { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }

	// Only act on a config still carrying the old field, so a re-run cannot overwrite a later choice
	if (!config || !('variables' in config)) return result

	const wasEnabled = config.variables === true
	delete config.variables
	config.connectionVariables = wasEnabled
		? (['encoders', 'decoders', 'danteDevices'] satisfies ConnectionVariable[])
		: []

	return { ...result, updatedConfig: config }
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig, undefined>[] = [connectionVariablesFromCheckbox]
