import { describe, expect, it, vi } from 'vitest'
import type ModuleInstance from '../main.js'
import type { ConnectionVariable, ModuleConfig } from '../config.js'
import { UpdateVariableDefinitions, UpdateVariableValues, type VariablesSchema } from '../variables.js'

// A Dante device as the controller reported it, trimmed to the fields the variables read. RX 1 is subscribed to
// another device, RX 2 is not — the unsubscribed case reports empty strings and status NONE.
const DANTE_DEVICE = {
	name: 'Encoder 001',
	rxchn: [
		{ type: 'audio', name: 'Left', id: 1, subdev: 'Mixer-A', subchn: 'Out 3', status: 'SUBSCRIBE_SELF' },
		{ type: 'audio', name: 'Right', id: 2, subdev: '', subchn: '', status: 'NONE' },
	],
}

const ENCODER = { id: 1, name: 'Encoder 001-0b52', ip: '169.254.238.23' }
const DECODER = { id: 2, name: 'Decoder 001-0910', ip: '169.254.2.58' }

function instanceWith(connectionVariables: ConnectionVariable[]) {
	const setVariableDefinitions = vi.fn<(definitions: Record<string, { name: string }>) => void>()
	const setVariableValues = vi.fn<(values: VariablesSchema) => void>()
	const instance = {
		config: { connectionVariables } as ModuleConfig,
		chazyControl: { mxsta: { in: [ENCODER], out: [DECODER] }, dante: { dante: [DANTE_DEVICE] } },
		definedVariableIds: new Set<string>(),
		setVariableDefinitions,
		setVariableValues,
	} as unknown as ModuleInstance

	return { instance, setVariableDefinitions, setVariableValues }
}

/** Re-runs the definitions against a changed selection, as configUpdated does, and returns what was cleared */
function reselect(instance: ModuleInstance, connectionVariables: ConnectionVariable[]): VariablesSchema {
	const setVariableValues = vi.fn<(values: VariablesSchema) => void>()
	const changed = { ...instance, config: { connectionVariables }, setVariableValues } as unknown as ModuleInstance

	UpdateVariableDefinitions(changed)
	return setVariableValues.mock.calls[0]?.[0] ?? {}
}

function valuesFor(connectionVariables: ConnectionVariable[]): VariablesSchema {
	const { instance, setVariableValues } = instanceWith(connectionVariables)
	UpdateVariableValues(instance)
	return setVariableValues.mock.calls[0]?.[0] ?? {}
}

describe('connection variables are gated by the config selection', () => {
	it('defines nothing when no sets are selected', () => {
		const { instance, setVariableDefinitions, setVariableValues } = instanceWith([])
		UpdateVariableDefinitions(instance)
		UpdateVariableValues(instance)

		expect(setVariableDefinitions).toHaveBeenCalledWith({})
		expect(setVariableValues).not.toHaveBeenCalled()
	})

	it.each([
		['encoders', 'encoder_1'],
		['decoders', 'decoder_2'],
		['danteDevices', 'dante_Encoder_001'],
	] as const)('%s keeps only its own variable', (set, id) => {
		expect(Object.keys(valuesFor([set]))).toEqual([id])
	})

	it('keeps a variable per selected set when several are chosen', () => {
		expect(Object.keys(valuesFor(['encoders', 'decoders']))).toEqual(['encoder_1', 'decoder_2'])
	})

	it('ignores an unknown set name from a newer version of the module', () => {
		expect(Object.keys(valuesFor(['encoders', 'somethingNew' as ConnectionVariable]))).toEqual(['encoder_1'])
	})

	it('defines a variable for every value it keeps', () => {
		const sets: ConnectionVariable[] = ['encoders', 'decoders', 'danteDevices', 'danteSubscriptions']
		const { instance, setVariableDefinitions } = instanceWith(sets)
		UpdateVariableDefinitions(instance)

		expect(Object.keys(setVariableDefinitions.mock.calls[0][0])).toEqual(Object.keys(valuesFor(sets)))
	})
})

describe('variables that go away are cleared', () => {
	it('clears every variable when the selection is emptied', () => {
		const { instance } = instanceWith(['encoders', 'decoders'])
		UpdateVariableDefinitions(instance)

		const cleared = reselect(instance, [])

		expect(cleared).toEqual({ encoder_1: undefined, decoder_2: undefined })
		// An explicit undefined, not an absent key, is what asks the host to drop the value
		expect(Object.keys(cleared)).toEqual(['encoder_1', 'decoder_2'])
	})

	it('clears only the deselected set, leaving the rest defined', () => {
		const { instance } = instanceWith(['encoders', 'decoders'])
		UpdateVariableDefinitions(instance)

		expect(reselect(instance, ['encoders'])).toEqual({ decoder_2: undefined })
	})

	it('clears a device that has dropped out of the poll', () => {
		const { instance } = instanceWith(['encoders'])
		UpdateVariableDefinitions(instance)

		const gone = {
			...instance,
			chazyControl: { mxsta: { in: [], out: [] }, dante: { dante: [] } },
		} as unknown as ModuleInstance

		expect(reselect(gone, ['encoders'])).toEqual({ encoder_1: undefined })
	})

	it('clears nothing when the selection is unchanged', () => {
		const { instance } = instanceWith(['encoders'])
		UpdateVariableDefinitions(instance)

		expect(reselect(instance, ['encoders'])).toEqual({})
	})
})

describe('Dante subscription variables', () => {
	it('names the source as <device>:<channel>, with the device status alongside', () => {
		const values = valuesFor(['danteSubscriptions'])

		expect(values['dante_Encoder_001_rx1_source']).toBe('Mixer-A:Out 3')
		expect(values['dante_Encoder_001_rx1_status']).toBe('SUBSCRIBE_SELF')
	})

	it('leaves an unsubscribed channel empty rather than inventing text', () => {
		const values = valuesFor(['danteSubscriptions'])

		expect(values['dante_Encoder_001_rx2_source']).toBe('')
		expect(values['dante_Encoder_001_rx2_status']).toBe('NONE')
	})

	it('is independent of the whole-device variable', () => {
		expect(Object.keys(valuesFor(['danteSubscriptions']))).not.toContain('dante_Encoder_001')
		expect(Object.keys(valuesFor(['danteDevices']))).toEqual(['dante_Encoder_001'])
	})

	it('sanitises the device name, since ids are referenced as $(instance:id)', () => {
		expect(Object.keys(valuesFor(['danteSubscriptions'])).every((id) => /^[A-Za-z0-9_]+$/.test(id))).toBe(true)
	})
})
