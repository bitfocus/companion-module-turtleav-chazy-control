import { type CompanionFeedbackDefinitions, createModuleLogger } from '@companion-module/base'
import type ModuleInstance from '../main.js'
import { assertValidIPv4 } from '../api.js'
import { ensureAllFeedbackKeys } from './utils.js'

export enum FeedbackIdsPreview {
	Preview = 'preview',
}

export type FeedbackSchemaPreview = {
	[FeedbackIdsPreview.Preview]: {
		type: 'value'
		options: {
			device: string
		}
		result: string | null
	}
}

export const DEFAULT_CAPTURE_WIDTH = 240

export function getPreviewFeedbacks(instance: ModuleInstance): CompanionFeedbackDefinitions<FeedbackSchemaPreview> {
	const feedbacks: Partial<CompanionFeedbackDefinitions<FeedbackSchemaPreview>> = {}
	const logger = createModuleLogger('Feedbacks:Preview')
	const deviceChoices = instance.chazyControl.getDecoderEncoderIpChoices()

	feedbacks[FeedbackIdsPreview.Preview] = {
		name: 'Preview',
		type: 'value',
		options: [
			{
				id: 'device',
				type: 'dropdown',
				label: 'Device',
				choices: deviceChoices,
				default: deviceChoices[0]?.id ?? '',
				allowCustom: true,
				expressionDescription: 'Return IP of device (encoder or decoder)',
			},
		],
		callback: async (feedback) => {
			assertValidIPv4(feedback.options.device, 'device')
			instance.addFeedbackToPoll(feedback.id)

			return instance.getCapturePreview(feedback.options.device, DEFAULT_CAPTURE_WIDTH)
		},
		unsubscribe: (feedback) => {
			instance.removeFeedbackToPoll(feedback.id)
		},
	}

	logger.debug(`Setting ${Object.keys(feedbacks).length} feedback definitions`)
	ensureAllFeedbackKeys(feedbacks, FeedbackIdsPreview)
	return feedbacks
}
