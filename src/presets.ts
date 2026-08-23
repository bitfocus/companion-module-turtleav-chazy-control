import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'
import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import { FeedbackIdsPreview } from './feedbacks/preview.js'

export function UpdatePresets(self: ModuleInstance): void {
	const structure: CompanionPresetSection[] = [
		{
			id: 'section1',
			name: 'Preview Images',
			definitions: [
				{
					id: 'group1',
					name: 'Previews',
					description: '',
					type: 'simple',
					presets: ['device_preview'],
				},
			],
		},
	]

	const presets: CompanionPresetDefinitions<ModuleSchema> = {}

	presets['device_preview'] = {
		type: 'layered',
		name: 'Device Preview',
		elements: [
			{
				type: 'image',
				id: 'preview_image',
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				fillMode: 'fit',
				base64Image: { isExpression: true, value: '$(local:preview_image)' },
			},
		],
		localVariables: [
			{
				variableType: 'feedback',
				variableName: 'preview_image',
				feedbackId: FeedbackIdsPreview.Preview,
				options: { device: '' },
			},
		],
		steps: [],
		feedbacks: [],
	}

	self.setPresetDefinitions(structure, presets)
}
