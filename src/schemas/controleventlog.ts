import { z } from 'zod'

/**
 * Chazy Control – Control event log response schema (`getjson.cgi` — `controleventlog` section)
 *
 * Each entry is a single free-form log line (timestamp + message), e.g.:
 * `"1970-01-05 02:23:24 receive: connection timeout."`
 */

export const ChazyControlEventLogResponseSchema = z.compile(
	z.object({
		events_log: z.array(z.string()),
	}),
)

export type ChazyControlEventLogResponse = z.infer<typeof ChazyControlEventLogResponseSchema>
