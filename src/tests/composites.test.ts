import { describe, expect, it, vi } from 'vitest'
import type { CompanionGraphicsCompositeElementDefinitions } from '@companion-module/base'
import type ModuleInstance from '../main.js'
import { CompositeElementId, UpdateCompositeElements, type CompositeElementSchema } from '../composites.js'

function devicePreviewDefinition() {
	const setCompositeElementDefinitions =
		vi.fn<(definitions: CompanionGraphicsCompositeElementDefinitions<CompositeElementSchema>) => void>()
	UpdateCompositeElements({ setCompositeElementDefinitions } as unknown as ModuleInstance)

	expect(setCompositeElementDefinitions).toHaveBeenCalledTimes(1)
	const definition = setCompositeElementDefinitions.mock.calls[0][0][CompositeElementId.DevicePreview]
	if (!definition) throw new Error('Device Preview composite was not defined')
	return definition
}

describe('Device Preview composite element', () => {
	it('renders a single image element driven by the image option', () => {
		const { elements } = devicePreviewDefinition()

		expect(elements).toHaveLength(1)
		expect(elements[0]).toMatchObject({
			type: 'image',
			base64Image: { isExpression: true, value: '$(options:image)' },
			fillMode: { isExpression: true, value: '$(options:fillMode)' },
		})
	})

	it('only references options it declares', () => {
		// A typo like $(options:imgae) still type-checks, since expressions are plain strings, and at runtime just
		// resolves to nothing: the button silently stays blank.
		const { elements, options } = devicePreviewDefinition()
		const declared = new Set(options.map((option) => option.id))
		const referenced = [...JSON.stringify(elements).matchAll(/\$\(options:([A-Za-z0-9_]+)\)/g)].map((m) => m[1])

		expect(referenced.length).toBeGreaterThan(0)
		for (const id of referenced) expect(declared).toContain(id)
	})

	it('defaults to fitting the image, matching the previous preset', () => {
		const { options } = devicePreviewDefinition()

		expect(options.find((option) => option.id === 'fillMode')).toMatchObject({ type: 'dropdown', default: 'fit' })
	})
})
