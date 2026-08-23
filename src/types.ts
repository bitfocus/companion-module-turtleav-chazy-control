export interface GetOrSubmitMessage {
	data: string
	method: 'get' | 'submit'
}

export interface CaptureMessage {
	ip: string
	width: number
	method: 'capture'
}

export type Message = GetOrSubmitMessage | CaptureMessage
