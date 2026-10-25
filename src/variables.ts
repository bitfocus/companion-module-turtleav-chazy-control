import type ModuleInstance from './main.js'
import { createModuleLogger, type CompanionVariableValue, type JsonValue } from '@companion-module/base'
import { connectionVariablesOf } from './config.js'
import type { DanteDevice } from './schemas/dante.js'

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

interface VariableEntry {
	id: string
	name: string
	value: CompanionVariableValue
}

/**
 * One pair per receive channel of a Dante device: the transmitter it is subscribed to as `<device>:<channel>`, and
 * the device's own word for the subscription's state. An unsubscribed channel reports empty `subdev`/`subchn`, which
 * is kept as an empty string rather than invented text, so a button can test it with `$(…) == ''`.
 */
function danteSubscriptionEntries(device: DanteDevice): VariableEntry[] {
	const entries: VariableEntry[] = []
	const dev = toVariableId(device.name)

	for (const rx of device.rxchn) {
		const channel = `${dev}_rx${rx.id}`
		const label = `Dante: ${device.name} RX ${rx.id} (${rx.name})`
		const source = rx.subdev && rx.subchn ? `${rx.subdev}:${rx.subchn}` : ''

		entries.push({ id: `dante_${channel}_source`, name: `${label} Source`, value: source })
		entries.push({ id: `dante_${channel}_status`, name: `${label} Status`, value: rx.status })
	}

	return entries
}

function collectVariables(self: ModuleInstance): VariableEntry[] {
	const chosen = connectionVariablesOf(self.config)
	const entries: VariableEntry[] = []

	if (chosen.has('encoders')) {
		for (const enc of self.chazyControl.mxsta?.in ?? []) {
			entries.push({ id: `encoder_${enc.id}`, name: `Encoder: ${enc.name}`, value: asJsonValue(enc) })
		}
	}
	if (chosen.has('decoders')) {
		for (const dec of self.chazyControl.mxsta?.out ?? []) {
			entries.push({ id: `decoder_${dec.id}`, name: `Decoder: ${dec.name}`, value: asJsonValue(dec) })
		}
	}
	if (chosen.has('danteDevices')) {
		for (const dev of self.chazyControl.dante?.dante ?? []) {
			entries.push({ id: `dante_${toVariableId(dev.name)}`, name: `Dante: ${dev.name}`, value: asJsonValue(dev) })
		}
	}
	if (chosen.has('danteSubscriptions')) {
		for (const dev of self.chazyControl.dante?.dante ?? []) {
			entries.push(...danteSubscriptionEntries(dev))
		}
	}

	return entries
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const logger = createModuleLogger('Variables')
	const entries = collectVariables(self)
	const ids = new Set(entries.map((entry) => entry.id))

	// Explicitly clear anything that has gone — every set switched off, one set deselected, a device dropping out of
	// the poll, or a Dante device renamed, since those are keyed by name. Whether removing a definition also drops its
	// last value is up to the host, so don't rely on it: push undefined while the definition still exists.
	const cleared: VariablesSchema = {}
	for (const id of self.definedVariableIds) {
		if (!ids.has(id)) cleared[id] = undefined
	}
	if (Object.keys(cleared).length > 0) {
		logger.debug(`Clearing ${Object.keys(cleared).length} variables that are no longer defined`)
		self.setVariableValues(cleared)
	}

	const variables: Record<string, { name: string }> = {}
	for (const entry of entries) {
		variables[entry.id] = { name: entry.name }
	}

	self.definedVariableIds.clear()
	for (const id of ids) self.definedVariableIds.add(id)

	logger.info(`Setting ${Object.keys(variables).length} variable definitions`)
	self.setVariableDefinitions(variables)
}

export function UpdateVariableValues(self: ModuleInstance): void {
	const values: VariablesSchema = {}
	for (const entry of collectVariables(self)) {
		values[entry.id] = entry.value
	}

	// Nothing selected means no definitions either, so there is nothing to push
	if (Object.keys(values).length === 0) return
	self.setVariableValues(values)
}
