/** The start-of-image marker every JPEG begins with. */
const JPEG_SOI = [0xff, 0xd8] as const

/**
 * Companion's image element accepts a JPEG data URI, so a capture is passed through as-is rather than re-encoded to
 * PNG. That saves a synchronous decode and encode per capture (~5 ms) and keeps the data URI several times smaller,
 * since a lossless PNG of a decoded JPEG is much larger than the JPEG.
 *
 * The marker check keeps the one guarantee the old decode gave for free: a body that is not a JPEG, such as error
 * text the device returns with a 200, fails here instead of reaching the button as a broken image.
 */
export function jpegBufferToDataUri(jpeg: Buffer): string {
	if (jpeg.length < JPEG_SOI.length || jpeg[0] !== JPEG_SOI[0] || jpeg[1] !== JPEG_SOI[1]) {
		throw new Error('Capture is not a JPEG: missing start-of-image marker')
	}
	return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}
