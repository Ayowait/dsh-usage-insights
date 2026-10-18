/**
 * History backfill: fold every durable session log into the ledger once,
 * then only re-read files that grew.
 *
 * Session logs are zstd-compressed JSONL, one frame per append. Node's
 * one-shot decompressor stops after the first frame, so frames are walked by
 * their own headers (magic, header descriptor, block headers) and decoded one
 * at a time. A frame that fails its integrity check is skipped rather than
 * failing the whole file.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { fileStamp, readFileOrNull, writeJsonAtomic } from './ledger.js'
import { sessionsDir } from './paths.js'

const ZSTD_MAGIC = 0xfd2fb528

/** Byte length of one zstd frame starting at `start`, or -1 when malformed. */
function frameLength(buf, start) {
  if (start + 5 > buf.length) return -1
  if (buf.readUInt32LE(start) !== ZSTD_MAGIC) return -1
  let p = start + 4
  const descriptor = buf[p++]
  const fcsFlag = descriptor >> 6
  const singleSegment = (descriptor >> 5) & 1
  const checksum = (descriptor >> 2) & 1
  const dictFlag = descriptor & 3
  if (!singleSegment) p += 1
  p += dictFlag === 0 ? 0 : dictFlag === 1 ? 1 : dictFlag === 2 ? 2 : 4
  if (fcsFlag === 0) {
    if (singleSegment) p += 1
  } else if (fcsFlag === 1) p += 2
  else if (fcsFlag === 2) p += 4
  else p += 8
  for (;;) {
    if (p + 3 > buf.length) return -1
    const header = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16)
    p += 3
    const last = header & 1
    const type = (header >> 1) & 3
    const size = header >>> 3
    if (type === 3) return -1
    p += type === 1 ? 1 : size
    if (p > buf.length) return -1
    if (last) break
  }
  if (checksum) p += 4
  return p - start
}

/** Decompress every concatenated zstd frame in `buf`. */
export function decodeZstd(buf) {
  const chunks = []
  let cursor = 0
  while (cursor + 4 <= buf.length) {
    let start = cursor
    while (start + 4 <= buf.length && buf.readUInt32LE(start) !== ZSTD_MAGIC) start += 1
    if (start + 4 > buf.length) break
    const length = frameLength(buf, start)
    if (length <= 0) {
      cursor = start + 1
      continue
    }
    try {
      chunks.push(zstdDecompressSync(buf.subarray(start, start + length)))
    } catch {
      // Integrity failure: move past this frame, keep the readable remainder.
    }
    cursor = start + length
  }
  return Buffer.concat(chunks)
}

/** Read one session file as UTF-8 JSONL text (zstd or plain). */
export function readSessionText(file) {
  const buffer = readFileSync(file)
  if (file.endsWith('.zstd') || (buffer.length > 4 && buffer.readUInt32LE(0) === ZSTD_MAGIC)) {
    return decodeZstd(buffer).toString('utf8')
  }
  return buffer.toString('utf8')
}

/** All session logs under the DSH home, newest first is not guaranteed. */
export function listSessionFiles(root = sessionsDir()) {
  const files = []
  const walk = (dir, depth) => {
    if (depth > 4) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.isFile() && (entry.name.endsWith('.zstd') || entry.name.endsWith('.jsonl'))) files.push(full)
    }
  }
  if (existsSync(root)) walk(root, 0)
  return files
}

/** Extract ledger records from one session log's text. */
export function extractRecords(text, fallbackId) {
  const lines = text.split('\n')
  let sessionId = fallbackId
  let inheritedUntil = -1
  const events = []
  for (const line of lines) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type === 'session' && typeof event.id === 'string') {
      sessionId = event.id
      continue
    }
    if (event.type === 'session/end-seed' && event.data && event.data.inherited === true && inheritedUntil < 0) {
      inheritedUntil = Number(event.seq) || 0
    }
    events.push(event)
  }
  const records = []
  for (const event of events) {
    const seq = Number(event.seq)
    if (inheritedUntil >= 0 && Number.isFinite(seq) && seq <= inheritedUntil) continue
    if (event.type === 'assistant/message') {
      const usage = event.data && event.data.usage
      const source = event.data && event.data.message && event.data.message.source
      if (!usage || !source || source.kind !== 'model') continue
      records.push({
        id: `${sessionId}#${seq}`,
        ts: Number(event.time),
        sid: sessionId,
        seq,
        provider: source.provider,
        model: source.model,
        input: usage.inputTokens,
        output: usage.outputTokens,
        cacheRead: usage.cacheReadTokens,
        cacheWrite: usage.cacheWriteTokens,
        total: usage.totalTokens,
        kind: 'turn',
      })
      continue
    }
    if (event.type === 'compaction/summary') {
      const data = event.data || {}
      if (!data.usage || !data.compactionId) continue
      records.push({
        id: `compaction:${data.compactionId}`,
        ts: Number(event.time),
        sid: sessionId,
        provider: data.provider,
        model: data.model,
        input: data.usage.inputTokens,
        output: data.usage.outputTokens,
        cacheRead: data.usage.cacheReadTokens,
        cacheWrite: data.usage.cacheWriteTokens,
        total: data.usage.totalTokens,
        kind: 'compaction',
      })
    }
  }
  return { sessionId, records }
}

const STATE_VERSION = 2

export class Backfill {
  /**
   * @param {import('./ledger.js').Ledger} ledger
   * @param {string} stateFile
   * @param {string} root
   */
  constructor(ledger, stateFile, root = sessionsDir()) {
    this.ledger = ledger
    this.stateFile = stateFile
    this.root = root
    this.files = {}
    this.running = false
    this.startedAt = null
    this.finishedAt = null
    this.scanned = 0
    this.total = 0
    this.added = 0
    this.error = null
    this.loadState()
  }

  loadState() {
    const text = readFileOrNull(this.stateFile)
    if (text === null) return
    try {
      const parsed = JSON.parse(text)
      if (parsed && parsed.version === STATE_VERSION && parsed.files && typeof parsed.files === 'object') {
        this.files = parsed.files
        this.finishedAt = Number(parsed.finishedAt) || null
      }
    } catch {
      this.files = {}
    }
  }

  saveState() {
    try {
      writeJsonAtomic(this.stateFile, {
        version: STATE_VERSION,
        files: this.files,
        finishedAt: this.finishedAt,
      })
    } catch {
      // A read-only home only costs a rescan next boot.
    }
  }

  status() {
    return {
      running: this.running,
      scanned: this.scanned,
      total: this.total,
      added: this.added,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      error: this.error,
    }
  }

  /** Kick off a scan; concurrent calls reuse the running one. */
  start() {
    if (this.running) return this.current
    this.running = true
    this.startedAt = Date.now()
    this.scanned = 0
    this.added = 0
    this.error = null
    this.current = this.run().finally(() => {
      this.running = false
      this.finishedAt = Date.now()
      this.saveState()
    })
    return this.current
  }

  async run() {
    const files = listSessionFiles(this.root)
    this.total = files.length
    for (const file of files) {
      const stamp = fileStamp(file)
      if (stamp === null) continue
      const previous = this.files[file]
      if (previous && previous.size === stamp.size && previous.mtime === stamp.mtime) {
        this.scanned += 1
        continue
      }
      try {
        const text = readSessionText(file)
        const { records } = extractRecords(text, basename(dirname(file)))
        this.added += this.ledger.addMany(records)
      } catch (error) {
        this.error = error && error.message ? error.message : String(error)
      }
      this.files[file] = stamp
      this.scanned += 1
      this.saveState()
      // Yield so a big history never blocks the Host's event loop.
      await new Promise((resolve) => setImmediate(resolve))
    }
    this.files = this.pruneMissing(this.files, files)
  }

  /** Drop cursors for session logs that no longer exist. */
  pruneMissing(state, files) {
    const live = new Set(files)
    const next = {}
    for (const key of Object.keys(state)) if (live.has(key)) next[key] = state[key]
    return next
  }
}
