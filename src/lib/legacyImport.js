// Browser-side loader for the Dynamics-365 export bundle.
//
// Why this exists: the normalised exports are client PII and gitignored, so no
// deploy carries them to the server, and the server may have no shell to run
// `npm run import:legacy` on. This is the path that needs neither — a Director
// picks a file and the browser streams it to the API's
// POST /admin/legacy/import/:entity, which upserts on the Dynamics record GUID.
//
// Everything here is pure and takes its `send` injected, so it unit-tests
// without a network or a DOM.

// Records per request. The corpus is ~125 MB of JSON but ~13 MB gzipped; at
// this batch size the largest request is ~400 KB compressed, which stays under
// nginx's 1 MB default client_max_body_size. Raising it past ~2000 breaks that.
export const BATCH_SIZE = 1000

// Without CompressionStream we send plain JSON, so batches must be far smaller
// to stay under the same 1 MB ceiling (the fattest rows are ~4.4 KB each).
export const UNCOMPRESSED_BATCH_SIZE = 150

const MAX_ATTEMPTS = 3

export const canCompress = () => typeof CompressionStream !== 'undefined'
export const canDecompress = () => typeof DecompressionStream !== 'undefined'

/** Fixed-size batches; the last one is short. */
export const chunkRecords = (records, size) => {
  const batches = []
  for (let offset = 0; offset < records.length; offset += size) {
    batches.push(records.slice(offset, offset + size))
  }
  return batches
}

const streamToBytes = async (stream) =>
  new Uint8Array(await new Response(stream).arrayBuffer())

/** JSON → gzipped bytes, via the platform's CompressionStream. */
export const gzipJson = async (value) => {
  const source = new Blob([JSON.stringify(value)]).stream()
  return streamToBytes(source.pipeThrough(new CompressionStream('gzip')))
}

/**
 * Reads an upload into an array of records. Accepts the bundle's `.json.gz` as
 * well as a plain `.json`, because whoever is loading this should not have to
 * know or care which one they were handed.
 */
export const readUpload = async (file) => {
  const gzipped = /\.gz$/i.test(file.name) || (await looksGzipped(file))
  let text
  if (gzipped) {
    if (!canDecompress()) {
      throw new Error(
        'This browser cannot open .gz files — use the plain .json export, or Chrome/Safari/Firefox.'
      )
    }
    const bytes = await streamToBytes(file.stream().pipeThrough(new DecompressionStream('gzip')))
    text = new TextDecoder().decode(bytes)
  } else {
    text = await file.text()
  }

  let records
  try {
    records = JSON.parse(text)
  } catch {
    throw new Error(`${file.name} is not valid JSON.`)
  }
  if (!Array.isArray(records)) {
    throw new Error(`${file.name} must contain a list of records.`)
  }
  if (records.length === 0) {
    throw new Error(`${file.name} contains no records.`)
  }
  return records
}

// gzip's magic number, for a file someone renamed or a browser that reports no
// extension. Reading two bytes is cheaper than being wrong about a 5 MB file.
const looksGzipped = async (file) => {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  return head[0] === 0x1f && head[1] === 0x8b
}

/**
 * Uploads one entity's records batch by batch.
 *
 * @param {object} options
 * @param {string} options.entity  export entity name, e.g. 'accounts'
 * @param {Array}  options.records
 * @param {(args: { entity: string, body: unknown, gzipped: boolean }) => Promise<{records: number}>} options.send
 * @param {(progress: { sent: number, total: number, batch: number, batches: number }) => void} [options.onProgress]
 * @returns {Promise<{ entity: string, records: number, batches: number }>}
 */
export const pushRecords = async ({ entity, records, send, onProgress, batchSize }) => {
  const gzipped = canCompress()
  const size = batchSize || (gzipped ? BATCH_SIZE : UNCOMPRESSED_BATCH_SIZE)
  const batches = chunkRecords(records, size)

  let sent = 0
  for (const [index, batch] of batches.entries()) {
    const body = gzipped ? await gzipJson(batch) : batch
    const summary = await sendWithRetry(send, { entity, body, gzipped }, index)
    sent += summary?.records ?? batch.length
    onProgress?.({ sent, total: records.length, batch: index + 1, batches: batches.length })
  }
  return { entity, records: sent, batches: batches.length }
}

/**
 * Retries transport failures and 5xx; a 4xx is the data or the session and
 * would fail identically on every attempt, so it surfaces at once. The batch
 * number is named in the message — with an idempotent upsert the fix is to
 * re-run the whole file, but knowing where it stopped is what makes the error
 * actionable.
 */
const sendWithRetry = async (send, args, index) => {
  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await send(args)
    } catch (error) {
      const status = error?.status ?? 0
      if (status >= 400 && status < 500) {
        throw new Error(`Batch ${index + 1} rejected: ${error.message}`)
      }
      lastError = error
    }
  }
  throw new Error(`Batch ${index + 1} failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`)
}
