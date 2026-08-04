import { describe, it, expect, vi } from 'vitest'
import { gzipSync, gunzipSync } from 'node:zlib'
import {
  chunkRecords,
  gzipJson,
  readUpload,
  pushRecords,
  BATCH_SIZE,
  UNCOMPRESSED_BATCH_SIZE,
} from './legacyImport.js'

const record = (n) => ({ guid: `guid-${n}`, name: `Account ${n}`, source_file: 'x.xlsx', raw: {} })
const records = (count) => Array.from({ length: count }, (_, i) => record(i))

// Minimal stand-in for the browser File the <input type="file"> hands over:
// name + text() + stream() + slice() is the whole surface readUpload touches.
const fakeFile = (name, bytes) => ({
  name,
  text: async () => Buffer.from(bytes).toString('utf8'),
  arrayBuffer: async () => bytes,
  slice: (start, end) => ({
    arrayBuffer: async () => Buffer.from(bytes).subarray(start, end),
  }),
  stream: () => new Blob([bytes]).stream(),
})

const jsonFile = (name, value) => fakeFile(name, Buffer.from(JSON.stringify(value), 'utf8'))
const gzFile = (name, value) => fakeFile(name, gzipSync(Buffer.from(JSON.stringify(value), 'utf8')))

// Stands in for the API: unpacks the batch it was sent and answers with the
// count, exactly as POST /admin/legacy/import/:entity does.
const apiStub = () =>
  vi.fn(async ({ body, gzipped }) => {
    const json = gzipped ? gunzipSync(Buffer.from(body)).toString('utf8') : JSON.stringify(body)
    return { records: JSON.parse(json).length }
  })

describe('chunkRecords', () => {
  it('splits into fixed-size batches, last one short', () => {
    expect(chunkRecords([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns no batches for no records', () => {
    expect(chunkRecords([], 100)).toEqual([])
  })

  it('keeps the largest batch under the 1 MB proxy ceiling once gzipped', async () => {
    // The guarantee the batch size exists for: nginx defaults
    // client_max_body_size to 1 MB, and we cannot reconfigure the server.
    const fat = Array.from({ length: BATCH_SIZE }, (_, i) => ({
      ...record(i),
      raw: { blob: 'x'.repeat(3000) }, // fatter than the real accounts rows
    }))
    const bytes = await gzipJson(fat)
    expect(bytes.length).toBeLessThan(1024 * 1024)
  })
})

describe('readUpload', () => {
  it('reads a plain .json array', async () => {
    expect(await readUpload(jsonFile('accounts.json', records(2)))).toHaveLength(2)
  })

  it('reads a gzipped .json.gz array', async () => {
    expect(await readUpload(gzFile('accounts.json.gz', records(3)))).toHaveLength(3)
  })

  // Someone will rename the file. Sniff the gzip magic number rather than trust
  // the extension.
  it('reads a gzipped file whose name lost the .gz', async () => {
    expect(await readUpload(gzFile('accounts.json', records(3)))).toHaveLength(3)
  })

  it('rejects a file that is not JSON', async () => {
    await expect(readUpload(fakeFile('notes.json', Buffer.from('hello', 'utf8')))).rejects.toThrow(
      /not valid JSON/i
    )
  })

  it('rejects a JSON object that is not a list of records', async () => {
    await expect(readUpload(jsonFile('accounts.json', { guid: 'x' }))).rejects.toThrow(/list of records/i)
  })

  it('rejects an empty list', async () => {
    await expect(readUpload(jsonFile('accounts.json', []))).rejects.toThrow(/no records/i)
  })
})

describe('pushRecords', () => {
  it('sends every record in gzipped batches and reports progress', async () => {
    const send = apiStub()
    const seen = []

    const summary = await pushRecords({
      entity: 'accounts',
      records: records(250),
      batchSize: 100,
      send,
      onProgress: (p) => seen.push(p),
    })

    expect(send).toHaveBeenCalledTimes(3)
    expect(summary).toEqual({ entity: 'accounts', records: 250, batches: 3 })
    expect(seen.at(-1)).toEqual({ sent: 250, total: 250, batch: 3, batches: 3 })
    expect(send.mock.calls[0][0].entity).toBe('accounts')
    expect(send.mock.calls[0][0].gzipped).toBe(true)
    expect(send.mock.calls[0][0].body).toBeInstanceOf(Uint8Array)
  })

  it('counts what the API reports', async () => {
    const send = apiStub()
    const summary = await pushRecords({ entity: 'accounts', records: records(100), send })
    expect(summary.records).toBe(100)
  })

  it('falls back to the batch size if a response carries no count', async () => {
    const send = vi.fn(async () => ({}))
    const summary = await pushRecords({ entity: 'accounts', records: records(30), send })
    expect(summary.records).toBe(30)
  })

  // A rejected batch fails the same way every time; retrying only burns the
  // rate-limit bucket.
  it('surfaces a 4xx immediately without retrying', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Unknown column'), { status: 422 })
    })

    await expect(
      pushRecords({ entity: 'accounts', records: records(10), send })
    ).rejects.toThrow(/Batch 1 rejected: Unknown column/)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries a transport failure and carries on', async () => {
    const api = apiStub()
    let calls = 0
    const send = vi.fn(async (args) => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('network down'), { status: 0 })
      return api(args)
    })

    const summary = await pushRecords({ entity: 'accounts', records: records(10), send })
    expect(summary.records).toBe(10)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('gives up after three attempts, naming the batch', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('gateway timeout'), { status: 504 })
    })

    await expect(
      pushRecords({ entity: 'accounts', records: records(10), send })
    ).rejects.toThrow(/Batch 1 failed after 3 attempts/)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('defaults to the gzip batch size where compression exists', async () => {
    expect(BATCH_SIZE).toBeGreaterThan(UNCOMPRESSED_BATCH_SIZE)
    const send = apiStub()
    await pushRecords({ entity: 'accounts', records: records(BATCH_SIZE + 1), send })
    expect(send).toHaveBeenCalledTimes(2)
  })
})
