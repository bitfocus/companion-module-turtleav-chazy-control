import { describe, expect, it } from 'vitest'
import type { CompanionStaticUpgradeProps, CompanionUpgradeContext } from '@companion-module/base'
import type { ModuleConfig } from '../config.js'
import { connectionVariablesOf } from '../config.js'
import { UpgradeScripts } from '../upgrades.js'

type LegacyConfig = Partial<ModuleConfig> & { variables?: boolean }

function runUpgrades(config: LegacyConfig | null) {
	const context = { currentConfig: config } as unknown as CompanionUpgradeContext<ModuleConfig>
	const props = {
		config: config as ModuleConfig | null,
		secrets: null,
		actions: [],
		feedbacks: [],
	} as CompanionStaticUpgradeProps<ModuleConfig, undefined>

	let updated: ModuleConfig | null = null
	for (const script of UpgradeScripts) {
		const result = script(context, { ...props, config: updated ?? props.config })
		updated = result.updatedConfig ?? updated
	}
	return updated
}

describe('variables checkbox -> connectionVariables', () => {
	it('keeps the whole-object sets a ticked checkbox used to produce', () => {
		const updated = runUpgrades({ variables: true })

		expect(updated?.connectionVariables).toEqual(['encoders', 'decoders', 'danteDevices'])
		// Subscriptions did not exist before, so enabling it would add variables never asked for
		expect(updated?.connectionVariables).not.toContain('danteSubscriptions')
	})

	it('selects nothing when the checkbox was off', () => {
		expect(runUpgrades({ variables: false })?.connectionVariables).toEqual([])
	})

	it('removes the old field, so the upgrade cannot run twice', () => {
		const updated = runUpgrades({ variables: true }) as LegacyConfig | null

		expect(updated && 'variables' in updated).toBe(false)
		expect(runUpgrades(updated)).toBeNull()
	})

	it('leaves a config that never had the field alone', () => {
		expect(runUpgrades({ connectionVariables: ['encoders'] })).toBeNull()
		expect(runUpgrades(null)).toBeNull()
	})

	it('produces a selection the config accessor reads back', () => {
		const updated = runUpgrades({ variables: true })

		expect([...connectionVariablesOf(updated ?? {})]).toEqual(['encoders', 'decoders', 'danteDevices'])
	})
})
