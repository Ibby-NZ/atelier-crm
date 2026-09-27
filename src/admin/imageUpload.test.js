import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  IMAGE_FIELDS,
  MAX_IMAGE_BYTES,
  MEDIA_UPLOAD_PATH,
  describeImage,
  fileNameFromUrl,
  formatBytes,
  imageField,
  imageProblem,
  imageTypeOf,
  readUpload,
  uploadImage,
  uploadMessage,
  uploadPath,
} from './imageUpload.js'

const file = (name, type, size = 250_000) => ({ name, type, size })
const MEDIA_URL = 'https://atelier.co.nz/_emdash/api/media/file/01JH8Q-pierre-frey.jpg'

describe('IMAGE_FIELDS', () => {
  it('declares exactly the five columns the CRM writes an image into', () => {
    expect(Object.keys(IMAGE_FIELDS).sort()).toEqual([
      'brands.image_url',
      'brands.logo_url',
      'collections.image_url',
      'colourways.image_url',
      'products.hi_res_asset_url',
    ])
  })

  it('never accepts SVG, and only the logo refuses JPEG', () => {
    for (const [key, spec] of Object.entries(IMAGE_FIELDS)) {
      expect(spec.types).not.toContain('image/svg+xml')
      expect(spec.types.includes('image/jpeg')).toBe(key !== 'brands.logo_url')
    }
  })

  it('throws on a field nobody declared, rather than accepting anything', () => {
    expect(() => imageField('brands.website_url')).toThrow(/Unknown image field/)
  })
})

describe('imageTypeOf', () => {
  it('uses the type the browser reported when it is one of the three', () => {
    expect(imageTypeOf(file('a.jpg', 'image/jpeg'))).toBe('image/jpeg')
    expect(imageTypeOf(file('a.PNG', 'IMAGE/PNG'))).toBe('image/png')
  })

  it('reads the older names for JPEG and PNG as the standard ones', () => {
    expect(imageTypeOf(file('a.jpg', 'image/jpg'))).toBe('image/jpeg')
    expect(imageTypeOf(file('a.jpg', 'image/pjpeg'))).toBe('image/jpeg')
    expect(imageTypeOf(file('a.png', 'image/x-png'))).toBe('image/png')
  })

  it('falls back to the extension only when the browser reported nothing', () => {
    expect(imageTypeOf(file('mark.WEBP', ''))).toBe('image/webp')
    expect(imageTypeOf(file('hero.jpeg', ''))).toBe('image/jpeg')
    expect(imageTypeOf(file('notes.txt', ''))).toBeNull()
  })

  it('does not let an extension overrule a type the browser did report', () => {
    expect(imageTypeOf(file('logo.png', 'image/svg+xml'))).toBeNull()
    expect(imageTypeOf(file('sheet.jpg', 'application/pdf'))).toBeNull()
  })
})

describe('formatBytes', () => {
  it('reads as a person would say it', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1.4 * 1024 * 1024)).toBe('1.4 MB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2 MB')
    expect(formatBytes(MAX_IMAGE_BYTES)).toBe('10 MB')
    expect(formatBytes(12.6 * 1024 * 1024)).toBe('13 MB')
  })

  it('is blank for something that is not a size', () => {
    expect(formatBytes(-1)).toBe('')
    expect(formatBytes('lots')).toBe('')
  })
})

describe('imageProblem', () => {
  it('passes a photograph of a supported type and size', () => {
    expect(imageProblem(file('hero.jpg', 'image/jpeg'), 'brands.image_url')).toBeNull()
    expect(imageProblem(file('tile.webp', 'image/webp'), 'collections.image_url')).toBeNull()
    expect(imageProblem(file('mark.png', 'image/png'), 'brands.logo_url')).toBeNull()
  })

  it('asks for a file when there is none', () => {
    expect(imageProblem(null, 'brands.image_url')).toBe('Choose an image first.')
  })

  it('names the file and the types it could have been', () => {
    expect(imageProblem(file('lookbook.pdf', 'application/pdf'), 'colourways.image_url')).toBe(
      'lookbook.pdf is not a JPEG, PNG or WebP image.'
    )
    expect(imageProblem(file('mark.svg', 'image/svg+xml'), 'brands.image_url')).toMatch(/^mark\.svg is not/)
  })

  it('refuses a JPEG logo and says why', () => {
    const problem = imageProblem(file('pierre-frey.jpg', 'image/jpeg'), 'brands.logo_url')
    expect(problem).toMatch(/^pierre-frey\.jpg is not a PNG or WebP/)
    expect(problem).toContain('transparent background')
  })

  it('refuses an empty file and one past the limit, and lets the limit itself through', () => {
    expect(imageProblem(file('a.jpg', 'image/jpeg', 0), 'brands.image_url')).toBe('a.jpg is empty.')
    expect(imageProblem(file('scan.jpg', 'image/jpeg', 14 * 1024 * 1024), 'brands.image_url')).toMatch(
      /^scan\.jpg is 14 MB — the limit is 10 MB\. Save a smaller copy/
    )
    // A byte over must not read as "is 10 MB — the limit is 10 MB".
    expect(imageProblem(file('scan.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1), 'brands.image_url')).toMatch(
      /^scan\.jpg is just over 10 MB — the limit is 10 MB\./
    )
    expect(imageProblem(file('a.jpg', 'image/jpeg', MAX_IMAGE_BYTES), 'brands.image_url')).toBeNull()
  })
})

describe('uploadPath', () => {
  it('carries the column and the file name in the query string', () => {
    expect(uploadPath('brands.logo_url', 'pierre frey.png')).toBe(
      `${MEDIA_UPLOAD_PATH}?field=brands.logo_url&filename=pierre+frey.png`
    )
  })

  it('leaves the name out rather than sending it empty', () => {
    expect(uploadPath('colourways.image_url', '')).toBe('/admin/media?field=colourways.image_url')
  })

  it('refuses an undeclared column', () => {
    expect(() => uploadPath('brands.story', 'a.jpg')).toThrow()
  })
})

describe('readUpload', () => {
  it('returns the absolute address the API sent back', () => {
    const media = { id: 7, url: MEDIA_URL, size: 1200 }
    expect(readUpload({ media })).toEqual({ url: MEDIA_URL, media })
  })

  it('refuses a root-relative address — the API would 422 it on save', () => {
    expect(readUpload({ media: { url: '/_emdash/api/media/file/abc.jpg' } }).error).toMatch(/full web address/)
  })

  it('refuses a missing body, a missing url and a non-web scheme', () => {
    expect(readUpload(null).error).toBeTruthy()
    expect(readUpload({ media: {} }).error).toBeTruthy()
    expect(readUpload({ media: { url: 'javascript:alert(1)' } }).error).toBeTruthy()
  })
})

describe('uploadMessage', () => {
  it('says nothing for an upload the person cancelled', () => {
    expect(uploadMessage({ aborted: true, message: 'Upload cancelled.' })).toBe('')
  })

  it('turns a missing route into "paste a link for now"', () => {
    for (const status of [404, 405, 501]) {
      expect(uploadMessage({ status, message: 'Route POST:/admin/media not found' })).toMatch(
        /not switched on in the API yet/
      )
    }
  })

  it('explains a body too large even when the proxy sent no sentence', () => {
    expect(uploadMessage({ status: 413, message: 'We could not load this right now.' })).toMatch(/larger than the server accepts/)
  })

  it('lets the API phrase everything else', () => {
    expect(uploadMessage({ status: 422, message: 'That file is not an image.' })).toBe('That file is not an image.')
    expect(uploadMessage({ status: 500 })).toBe('The image could not be uploaded.')
  })
})

describe('fileNameFromUrl', () => {
  it('is the last path segment, decoded, without the query', () => {
    expect(fileNameFromUrl(MEDIA_URL)).toBe('01JH8Q-pierre-frey.jpg')
    expect(fileNameFromUrl('https://cdn.example.com/a/Le%20Repos.jpg?w=800#x')).toBe('Le Repos.jpg')
    expect(fileNameFromUrl('https://cdn.example.com/houses/')).toBe('houses')
  })

  it('copes with what a hand-typed column can hold', () => {
    expect(fileNameFromUrl('/img/hero.jpg?v=2')).toBe('hero.jpg')
    expect(fileNameFromUrl('https://example.com')).toBe('')
    expect(fileNameFromUrl('')).toBe('')
    expect(fileNameFromUrl(null)).toBe('')
    expect(fileNameFromUrl('https://x.test/%E0%A4%A.jpg')).toBe('%E0%A4%A.jpg')
  })
})

describe('describeImage', () => {
  it('joins what is known', () => {
    expect(describeImage({ width: 2560, height: 1707, name: 'hero.jpg', bytes: 1.4 * 1024 * 1024 })).toBe(
      '2560 × 1707 · JPG · 1.4 MB'
    )
    expect(describeImage({ width: 800, height: 800, name: 'no-extension' })).toBe('800 × 800')
    expect(describeImage({ name: 'mark.png' })).toBe('PNG')
    expect(describeImage()).toBe('')
  })
})

describe('uploadImage', () => {
  const ok = (url = MEDIA_URL) => vi.fn(async () => ({ media: { id: 1, url, size: 999 } }))

  it('sends the raw file with its type stated, and resolves to the address', async () => {
    const send = ok()
    const signal = new AbortController().signal
    const onProgress = vi.fn()
    const chosen = file('Hero Shot.JPG', '', 400_000)
    const result = await uploadImage(chosen, 'brands.image_url', { send, signal, onProgress })
    expect(result.url).toBe(MEDIA_URL)
    expect(send).toHaveBeenCalledTimes(1)
    const [path, body, options] = send.mock.calls[0]
    expect(path).toBe('/admin/media?field=brands.image_url&filename=Hero+Shot.JPG')
    expect(body).toBe(chosen)
    expect(options).toEqual({ contentType: 'image/jpeg', onProgress, signal })
  })

  it('never sends a file it has already refused', async () => {
    const send = ok()
    await expect(uploadImage(file('mark.jpg', 'image/jpeg'), 'brands.logo_url', { send })).rejects.toThrow(
      /not a PNG or WebP/
    )
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects with the sentence for the status, keeping the status', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Route POST:/admin/media not found'), { status: 404 })
    })
    const error = await uploadImage(file('a.png', 'image/png'), 'collections.image_url', { send }).catch((e) => e)
    expect(error.message).toMatch(/not switched on/)
    expect(error.status).toBe(404)
    expect(error.aborted).toBe(false)
  })

  it('marks a cancelled upload so the field can stay quiet about it', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Upload cancelled.'), { status: 0, aborted: true })
    })
    const error = await uploadImage(file('a.png', 'image/png'), 'colourways.image_url', { send }).catch((e) => e)
    expect(error.aborted).toBe(true)
    expect(error.message).toBe('')
  })

  it('rejects a success that carries no usable address', async () => {
    await expect(
      uploadImage(file('a.png', 'image/png'), 'products.hi_res_asset_url', { send: ok('/relative.png') })
    ).rejects.toThrow(/full web address/)
  })
})

// There is no jsdom, so the wiring is checked against the source: each image
// column is an ImageField on the form that draws it, and no screen — including
// one added later — binds a bare <input> to an image column.
describe('every image column is an ImageField', () => {
  const screens = new URL('../screens/', import.meta.url)
  const source = (file) => readFileSync(new URL(file, screens), 'utf8').replace(/\r\n/g, '\n')
  const owners = {
    'BrandFields.jsx': ['brands.image_url', 'brands.logo_url'],
    'CollectionFields.jsx': ['collections.image_url'],
    'ProductFields.jsx': ['products.hi_res_asset_url'],
    'ProductVariations.jsx': ['colourways.image_url'],
  }

  it('gives each declared column a form that draws it', () => {
    expect(Object.values(owners).flat().sort()).toEqual(Object.keys(IMAGE_FIELDS).sort())
  })

  for (const [file, fields] of Object.entries(owners)) {
    it(`${file} imports it and uses it for ${fields.join(', ')}`, () => {
      const text = source(file)
      expect(text).toContain("import ImageField from '../admin/ImageField.jsx'")
      for (const field of fields) expect(text).toContain(`field="${field}"`)
    })
  }

  it('leaves no screen with an <input> bound to an image column', () => {
    // Any spelling: value={draft.image_url}, {...text('logo_url')},
    // {...lockable('hi_res_asset_url')}, onChange={setCw('image_url')}.
    const column = /\b(image_url|logo_url|hi_res_asset_url)\b/
    const bare = readdirSync(screens)
      .filter((file) => file.endsWith('.jsx'))
      .flatMap((file) =>
        source(file)
          .split('<input')
          .slice(1)
          .map((chunk) => chunk.split('/>')[0])
          .filter((input) => column.test(input))
          .map((input) => `${file}: <input${input.slice(0, 60)}`)
      )
    expect(bare).toEqual([])
  })
})
