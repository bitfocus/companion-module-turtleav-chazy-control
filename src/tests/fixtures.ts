/**
 * The head of a real capture from `capture.cgi` (320x180 baseline JFIF, taken during development with an encoder
 * attached), followed by the end-of-image marker. Enough to carry the JPEG markers, not a decodable image.
 */
export const CAPTURE_JPEG = Buffer.from([
	0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x90, 0xff, 0xd9,
])

/**
 * What the device's CGI returned, with a 200 and `Content-Type: application/json`, for a `getjson.cgi` section it
 * did not recognise (`schedule`). The device reports errors as plain text with a success status.
 */
export const DEVICE_ERROR_BODY = Buffer.from('format error!\n\n\n')
