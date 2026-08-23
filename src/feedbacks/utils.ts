import type {
	CompanionFeedbackDefinitions,
	CompanionFeedbackSchema,
	CompanionOptionValues,
} from '@companion-module/base'

export function ensureAllFeedbackKeys<
	TSchema extends Record<string, CompanionFeedbackSchema<CompanionOptionValues>>,
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
