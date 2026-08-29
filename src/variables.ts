import type ModuleInstance from './main.js'
import { createModuleLogger, type CompanionVariableValue, type JsonValue } from '@companion-module/base'

export type VariablesSchema = Record<string, CompanionVariableValue>

// Variable ids are referenced from expressions as $(instance:id), so restrict them to
// characters that can't break that syntax. Encoders/decoders are keyed by their numeric
// device id rather than name, so the id stays stable across renames; dante devices have
// no numeric id (the API addresses them by name) so their name is sanitised instead.
function toVariableId(name: string): string {
	return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

// These objects come straight from JSON.parse via the zod schemas, so they are JSON by
// construction. TS can't see that because fields with an unconfirmed shape are typed
// `z.array(z.unknown())`, which widens to `unknown[]` rather than a JSON-compatible type.
function asJsonValue(device: object): JsonValue {
	return device as JsonValue
}

function collectVariables(self: ModuleInstance): { id: string; name: string; value: CompanionVariableValue }[] {
	const entries: { id: string; name: string; value: CompanionVariableValue }[] = []

	for (const dev of self.chazyControl.dante?.dante ?? []) {
		entries.push({ id: `dante_${toVariableId(dev.name)}`, name: `Dante: ${dev.name}`, value: asJsonValue(dev) })
	}
	for (const enc of self.chazyControl.mxsta?.in ?? []) {
		entries.push({ id: `encoder_${enc.id}`, name: `Encoder: ${enc.name}`, value: asJsonValue(enc) })
	}
	for (const dec of self.chazyControl.mxsta?.out ?? []) {
		entries.push({ id: `decoder_${dec.id}`, name: `Decoder: ${dec.name}`, value: asJsonValue(dec) })
	}

	return entries
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const logger = createModuleLogger('Variables')
	const variables: Record<string, { name: string }> = {}

	if (self.config.variables) {
		for (const entry of collectVariables(self)) {
			variables[entry.id] = { name: entry.name }
		}
	}

	logger.info(`Setting ${Object.keys(variables).length} variable definitions`)
	self.setVariableDefinitions(variables)
}

export function UpdateVariableValues(self: ModuleInstance): void {
	if (!self.config.variables) return

	const values: VariablesSchema = {}
	for (const entry of collectVariables(self)) {
		values[entry.id] = entry.value
	}
	self.setVariableValues(values)
}
