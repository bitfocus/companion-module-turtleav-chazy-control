import { describe, expect, it, vi } from 'vitest'
import type { CompanionOptionValues } from '@companion-module/base'
import type ModuleInstance from '../main.js'
import type { Message } from '../types.js'
import ChazyControl from '../api.js'
import { ActionIdsDanteControl, danteChannelOptionId, getDanteControlActions } from '../actions/dante-control.js'
import { emptyDanteDevice, VALID_MXSTA_RESPONSE } from './fixtures.js'

// Stage-Box receives audio on two channels and sends one; Mixer only sends, so has no RX dropdown
const STAGE_BOX = {
	...emptyDanteDevice(),
	name: 'Stage-Box',
	priip: '169.254.40.1',
	rxchn: [
		{ type: 'audio', name: 'Mic 1', id: 1, subdev: '', subchn: '', status: 'NONE' },
		{ type: 'audio', name: 'Mic 2', id: 2, subdev: '', subchn: '', status: 'NONE' },
	],
	txchn: [{ type: 'audio', name: 'Return', id: 5, enable: 1 }],
}
const MIXER = {
	...emptyDanteDevice(),
	name: 'Mixer',
	priip: '169.254.40.2',
	txchn: [
		{ type: 'audio', name: 'Main L', id: 3, enable: 1 },
		{ type: 'audio', name: 'Main R', id: 4, enable: 1 },
	],
}

async function setUp() {
	const sendMsg = vi.fn<(msg: Message, signal?: AbortSignal) => Promise<unknown>>()
	sendMsg.mockImplementation(async (msg) => {
		if (msg.method === 'capture') throw new Error('Unexpected capture request')
		return {
			dante: {
				docver: 1,
				controller: { vip: '169.254.8.100', vsm: '255.255.0.0' },
				ddm: { server: '', port: 0, state: '', current_domain: '', domains: [] },
				dante: [STAGE_BOX, MIXER],
			},
			dantepreset: { dante_preset: [] },
			mxsta: VALID_MXSTA_RESPONSE,
			time: { docver: 1, time: '1970/01/05 02:09:27', tz: '' },
			controlevent: { events: [] },
			controleventlog: { events_log: [] },
		}[msg.data]
	})
	const chazyControl = new ChazyControl({ sendMsg, checkFeedbacksById: vi.fn() } as unknown as ModuleInstance, 60000)
	chazyControl.startPolling()
	await vi.waitFor(() => expect(chazyControl.dante).not.toBeNull())
	sendMsg.mockClear()

	const instance = { config: { model: 'chazy control' }, chazyControl, sendMsg } as unknown as ModuleInstance
	const action = getDanteControlActions(instance)[ActionIdsDanteControl.SetDanteSubscriptionByName]
	if (!action) throw new Error('Subscription (by name) is not defined')

	// an arrow, not a function declaration: a hoisted declaration loses the narrowing above
	const run = async (options: CompanionOptionValues): Promise<void> => {
		const event = { options } as unknown as Parameters<typeof action.callback>[0]
		const context = { signal: new AbortController().signal } as unknown as Parameters<typeof action.callback>[1]
		await action.callback(event, context)
	}

	return { action, sendMsg, run }
}

describe('Dante - Subscription (by name)', () => {
	it('gives each device a channel dropdown per type, listing its channels by name', async () => {
		const { action } = await setUp()
		const option = (id: string) => action.options.find((field) => field.id === id)

		expect(option('rxChan_Stage_Box_audio')).toMatchObject({
			type: 'dropdown',
			choices: [
				{ id: 1, label: 'Mic 1 (1)' },
				{ id: 2, label: 'Mic 2 (2)' },
			],
			default: 1,
		})
		expect(option('txChan_Mixer_audio')).toMatchObject({
			choices: [
				{ id: 0, label: 'None (remove subscription)' },
				{ id: 3, label: 'Main L (3)' },
				{ id: 4, label: 'Main R (4)' },
			],
			default: 3,
		})
	})

	it('leaves out an RX dropdown with no channels, but keeps a TX one so a subscription can be removed', async () => {
		const ids = (await setUp()).action.options.map((field) => field.id)

		expect(ids.filter((id) => id.startsWith('rxChan_'))).toEqual(['rxChan_Stage_Box_audio'])
		expect(ids.filter((id) => id.startsWith('txChan_'))).toEqual([
			'txChan_Stage_Box_audio',
			'txChan_Mixer_audio',
			'txChan_Stage_Box_video',
			'txChan_Mixer_video',
		])
		expect(ids).toContain('txChan_Mixer_video')
	})

	it('shows a channel dropdown only while its device and type are selected', async () => {
		const { action } = await setUp()
		const field = action.options.find((f) => f.id === 'txChan_Mixer_audio')

		expect(field?.isVisibleExpression).toBe(`$(options:txDev) == 'Mixer' && $(options:av) == 'AUDIO'`)
	})

	it('keeps the options the visibility expressions read as plain values from the list', async () => {
		const { action } = await setUp()

		for (const id of ['rxDev', 'av', 'txDev']) {
			expect(action.options.find((f) => f.id === id)).toMatchObject({
				type: 'dropdown',
				allowCustom: false,
				disableAutoExpression: true,
			})
		}
	})

	it("sends the selected devices' channels, ignoring the hidden dropdowns", async () => {
		const { run, sendMsg } = await setUp()

		await run({
			rxDev: 'Stage-Box',
			av: 'AUDIO',
			txDev: 'Mixer',
			rxChan_Stage_Box_audio: 2,
			txChan_Mixer_audio: 4,
			// still stored from earlier selections, and must not be read
			txChan_Stage_Box_audio: 5,
			txChan_Mixer_video: 0,
		})

		expect(sendMsg).toHaveBeenCalledExactlyOnceWith(
			{ data: 'SET DANTE DEV Stage-Box AUDIO RXCHN 2 SOURCE Mixer CHN 4', method: 'submit' },
			expect.any(AbortSignal),
		)
	})

	it('sends TX channel 0 to remove the subscription', async () => {
		const { run, sendMsg } = await setUp()

		await run({ rxDev: 'Stage-Box', av: 'AUDIO', txDev: 'Mixer', rxChan_Stage_Box_audio: 1, txChan_Mixer_audio: 0 })

		expect(sendMsg.mock.calls[0][0]).toEqual({
			data: 'SET DANTE DEV Stage-Box AUDIO RXCHN 1 SOURCE Mixer CHN 0',
			method: 'submit',
		})
	})

	it('refuses, rather than guess, when the selected device has no channel stored', async () => {
		const { run, sendMsg } = await setUp()

		// Mixer was picked, but only Stage-Box's TX channel holds a value
		await expect(
			run({ rxDev: 'Stage-Box', av: 'AUDIO', txDev: 'Mixer', rxChan_Stage_Box_audio: 1, txChan_Stage_Box_audio: 5 }),
		).rejects.toThrow('No AUDIO TX channel selected for Mixer')
		expect(sendMsg).not.toHaveBeenCalled()
	})
})

describe('danteChannelOptionId', () => {
	it('gives each device, direction and type its own id', () => {
		expect(danteChannelOptionId('rx', 'Stage-Box', 'AUDIO')).toBe('rxChan_Stage_Box_audio')
		expect(danteChannelOptionId('tx', 'Stage-Box', 'VIDEO')).toBe('txChan_Stage_Box_video')
	})
})
