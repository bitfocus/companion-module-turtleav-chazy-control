import {
	type CompanionGraphicsCompositeElementDefinitions,
	type DropdownChoice,
	type ImageFillMode,
} from '@companion-module/base'
import type ModuleInstance from './main.js'

/**
 * Composite graphics elements this module offers for layered buttons.
 *
 * A composite is only options plus a static list of elements: it has no callback, so it cannot capture an image
 * itself, or register the Preview feedback's device for image polling. The image arrives through the `image` option
 * instead, fed by a local variable bound to the Preview value feedback — the same split as the signal meter in
 * companion-module-turtleav-mineola.
 */
export enum CompositeElementId {
	DevicePreview = 'device_preview',
}

const FILL_MODE_CHOICES = [
	{ id: 'crop', label: 'Crop' },
	{ id: 'fill', label: 'Fill' },
	{ id: 'fit', label: 'Fit' },
] as const satisfies DropdownChoice<ImageFillMode>[]

export type CompositeElementSchema = {
	[CompositeElementId.DevicePreview]: { options: { image: string; fillMode: ImageFillMode } }
}

export function UpdateCompositeElements(self: ModuleInstance): void {
	const compositeElements: CompanionGraphicsCompositeElementDefinitions<CompositeElementSchema> = {
		[CompositeElementId.DevicePreview]: {
			type: 'composite',
			name: 'Device Preview',
			description:
				'A captured still from an encoder or decoder. Feed it an image, e.g. a local variable driven by the Preview feedback',
			options: [
				{
					type: 'textinput',
					label: 'Image',
					id: 'image',
					tooltip: 'A data URI, e.g. $(local:preview_image) bound to the Preview feedback',
					default: '',
				},
				{
					type: 'dropdown',
					label: 'Fill Mode',
					id: 'fillMode',
					choices: FILL_MODE_CHOICES,
					default: FILL_MODE_CHOICES[2].id,
				},
			],
			elements: [
				{
					type: 'image',
					name: 'Preview',
					x: 0,
					y: 0,
					width: 100,
					height: 100,
					fillMode: { isExpression: true, value: '$(options:fillMode)' },
					base64Image: { isExpression: true, value: '$(options:image)' },
				},
			],
		},
	}

	self.setCompositeElementDefinitions(compositeElements)
}
