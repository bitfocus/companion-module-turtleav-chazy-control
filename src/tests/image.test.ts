import { describe, expect, it } from 'vitest'
import { jpegBufferToDataUri } from '../utils/image.js'
import { CAPTURE_JPEG, DEVICE_ERROR_BODY } from './fixtures.js'

describe('jpegBufferToDataUri', () => {
	it('passes a capture through as a JPEG data URI, byte for byte', () => {
		const uri = jpegBufferToDataUri(CAPTURE_JPEG)

		expect(uri.startsWith('data:image/jpeg;base64,')).toBe(true)
		expect(Buffer.from(uri.slice('data:image/jpeg;base64,'.length), 'base64')).toEqual(CAPTURE_JPEG)
	})

	it.each([
		['error text the device returns with a 200', DEVICE_ERROR_BODY],
		['an empty body', Buffer.alloc(0)],
		['a single byte', Buffer.from([0xff])],
		['a PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
	])('rejects %s', (_label, body) => {
		expect(() => jpegBufferToDataUri(body)).toThrow('Capture is not a JPEG')
	})
})
