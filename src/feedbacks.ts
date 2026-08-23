import type ModuleInstance from './main.js'
import { createModuleLogger, type CompanionFeedbackDefinitions } from '@companion-module/base'
import { getPreviewFeedbacks, type FeedbackSchemaPreview } from './feedbacks/preview.js'

export type FeedbacksSchema = FeedbackSchemaPreview

export function UpdateFeedbacks(self: ModuleInstance): void {
	const logger = createModuleLogger('Feedbacks')
	const feedbacks: CompanionFeedbackDefinitions<FeedbacksSchema> = {
		...getPreviewFeedbacks(self),
	}
	logger.info(`Setting ${Object.keys(feedbacks).length} feedback definitions`)
	self.setFeedbackDefinitions(feedbacks)
}
