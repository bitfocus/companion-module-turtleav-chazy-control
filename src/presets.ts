import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import type {
	CompanionLayeredButtonPresetDefinition,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import { createModuleLogger } from '@companion-module/base'
import { FeedbackIdsPreview } from './feedbacks/preview.js'
import { CompositeElementId } from './composites.js'

const logger = createModuleLogger('Presets')

/** The local variable each preview preset binds to the Preview feedback, and feeds into the composite */
export const PREVIEW_LOCAL_VARIABLE = 'preview_image'

function buildDevicePreviewPreset(label: string, ip: string): CompanionLayeredButtonPresetDefinition<ModuleSchema> {
	return {
		type: 'layered',
		name: `Preview - ${label}`,
		elements: [
			{
				type: 'composite',
				id: 'preview_image',
				name: 'Device Preview',
				elementId: CompositeElementId.DevicePreview,
				options: {
					image: { isExpression: true, value: `$(local:${PREVIEW_LOCAL_VARIABLE})` },
					fillMode: 'fit',
				},
			},
		],
		localVariables: [
			{
				variableType: 'feedback',
				variableName: PREVIEW_LOCAL_VARIABLE,
				feedbackId: FeedbackIdsPreview.Preview,
				options: { device: ip },
			},
		],
		steps: [],
		feedbacks: [],
	}
}

export function UpdatePresets(self: ModuleInstance): void {
	const encoders = self.chazyControl.mxsta?.in ?? []
	const decoders = self.chazyControl.mxsta?.out ?? []

	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const encoderPresetIds: string[] = []
	const decoderPresetIds: string[] = []

	for (const enc of encoders) {
		const presetId = `preview_encoder_${enc.id}`
		presets[presetId] = buildDevicePreviewPreset(`ENC: ${enc.name}`, enc.ip)
		encoderPresetIds.push(presetId)
	}
	for (const dec of decoders) {
		const presetId = `preview_decoder_${dec.id}`
		presets[presetId] = buildDevicePreviewPreset(`DEC: ${dec.name}`, dec.ip)
		decoderPresetIds.push(presetId)
	}

	const structure: CompanionPresetSection[] = [
		{
			id: 'section1',
			name: 'Preview Images',
			definitions: [
				{
					id: 'encoders',
					name: 'Encoders',
					description: 'One preview button per discovered encoder.',
					type: 'simple',
					presets: encoderPresetIds,
				},
				{
					id: 'decoders',
					name: 'Decoders',
					description: 'One preview button per discovered decoder.',
					type: 'simple',
					presets: decoderPresetIds,
				},
			],
		},
	]

	logger.info(`Setting ${encoderPresetIds.length + decoderPresetIds.length} preset definitions`)

	self.setPresetDefinitions(structure, presets)
}
