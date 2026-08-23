import { decode } from 'jpeg-js'
import { PNG } from 'pngjs'

export function jpegBufferToPng64(jpegBuffer: Buffer): string {
	const decoded = decode(jpegBuffer, { useTArray: true })
	const png = new PNG({ width: decoded.width, height: decoded.height })
	png.data = Buffer.from(decoded.data)
	const encoded = PNG.sync.write(png)
	return `data:image/png;base64,${encoded.toString('base64')}`
}
