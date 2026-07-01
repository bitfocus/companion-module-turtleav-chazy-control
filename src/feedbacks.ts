import type ModuleInstance from './main.js'
import { createModuleLogger, type CompanionFeedbackDefinitions } from '@companion-module/base'

export enum FeedbackIDs {
	SampleFeedback = 'sample_feedback',
}

export type FeedbacksSchema = {
	[FeedbackIDs.SampleFeedback]: {
		type: 'boolean'
		options: {
			num: number
		}
	}
}

export function ensureAllFeedbackKeys<
	TSchema extends Record<string, any>,
	TEnum extends Record<string, keyof TSchema & string>,
>(
	feedbacks: Partial<CompanionFeedbackDefinitions<TSchema>>,
	feedbackIds: TEnum,
): asserts feedbacks is CompanionFeedbackDefinitions<TSchema> {
	for (const key of Object.values(feedbackIds)) {
		if (!(key in feedbacks)) {
			;(feedbacks as Record<string, unknown>)[key] = undefined
		}
	}
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const logger = createModuleLogger('Feedbacks')
	const feedbacks: Partial<CompanionFeedbackDefinitions<FeedbacksSchema>> = {}
	feedbacks[FeedbackIDs.SampleFeedback] = {
		name: 'Example Feedback',
		type: 'boolean',
		defaultStyle: {
			bgcolor: 0xff0000,
			color: 0x000000,
		},
		options: [
			{
				id: 'num',
				type: 'number',
				label: 'Test',
				default: 5,
				min: 0,
				max: 10,
				clampValues: true, // If value is outside the min/max, clamp it to the min/max instead of rejecting the input
			},
		],
		callback: (feedback) => {
			console.log('Hello world!', feedback.options.num)
			if (feedback.options.num > 5) {
				return true
			} else {
				return false
			}
		},
	}
	ensureAllFeedbackKeys(feedbacks, FeedbackIDs)
	logger.info(`Setting ${Object.keys(feedbacks).length} feedback definitions`)
	self.setFeedbackDefinitions(feedbacks)
}
