import { describe, expect, it, vi } from 'vitest'
import type {
	CompanionLayeredButtonPresetDefinition,
	CompanionPresetDefinitions,
	CompanionPresetGroupSimple,
	CompanionPresetSection,
} from '@companion-module/base'
import type ModuleInstance from '../main.js'
import type { ModuleSchema } from '../main.js'
import { PREVIEW_LOCAL_VARIABLE, UpdatePresets } from '../presets.js'
import { CompositeElementId } from '../composites.js'
import { FeedbackIdsPreview } from '../feedbacks/preview.js'

// Names and IPs as the device reported them in mxsta during development, with one encoder and one decoder attached
const ENCODER = { id: 1, name: 'Encoder 001-0b52', ip: '169.254.238.23' }
const DECODER = { id: 1, name: 'Decoder 001-0910', ip: '169.254.2.58' }

function runUpdatePresets(mxsta: { in: object[]; out: object[] } | null) {
	const setPresetDefinitions =
		vi.fn<(structure: CompanionPresetSection[], presets: CompanionPresetDefinitions<ModuleSchema>) => void>()
	UpdatePresets({ chazyControl: { mxsta }, setPresetDefinitions } as unknown as ModuleInstance)

	expect(setPresetDefinitions).toHaveBeenCalledTimes(1)
	const [structure, presets] = setPresetDefinitions.mock.calls[0]
	return { groups: structure[0].definitions as CompanionPresetGroupSimple[], presets }
}

function layeredPreset(
	presets: CompanionPresetDefinitions<ModuleSchema>,
	id: string,
): CompanionLayeredButtonPresetDefinition<ModuleSchema> {
	const preset = presets[id]
	if (preset?.type !== 'layered') throw new Error(`Expected a layered preset for ${id}`)
	return preset
}

describe('preview presets', () => {
	it('creates one preset per discovered encoder and decoder, grouped by kind', () => {
		const { groups, presets } = runUpdatePresets({ in: [ENCODER], out: [DECODER] })

		expect(Object.keys(presets)).toEqual(['preview_encoder_1', 'preview_decoder_1'])
		expect(groups.find((group) => group.id === 'encoders')?.presets).toEqual(['preview_encoder_1'])
		expect(groups.find((group) => group.id === 'decoders')?.presets).toEqual(['preview_decoder_1'])
	})

	it.each([
		['preview_encoder_1', ENCODER],
		['preview_decoder_1', DECODER],
	])('%s places the Device Preview composite, fed by the Preview feedback for that IP', (id, device) => {
		const { presets } = runUpdatePresets({ in: [ENCODER], out: [DECODER] })
		const preset = layeredPreset(presets, id)

		expect(preset.elements).toHaveLength(1)
		expect(preset.elements[0]).toMatchObject({
			type: 'composite',
			elementId: CompositeElementId.DevicePreview,
			options: { image: { isExpression: true, value: `$(local:${PREVIEW_LOCAL_VARIABLE})` } },
		})
		expect(preset.localVariables).toEqual([
			{
				variableType: 'feedback',
				variableName: PREVIEW_LOCAL_VARIABLE,
				feedbackId: FeedbackIdsPreview.Preview,
				options: { device: device.ip },
			},
		])
	})

	it('creates no presets before the first mxsta poll', () => {
		const { groups, presets } = runUpdatePresets(null)

		expect(presets).toEqual({})
		for (const group of groups) expect(group.presets).toEqual([])
	})
})
