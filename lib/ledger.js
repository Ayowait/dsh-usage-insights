/**
 * The usage ledger: one append-only JSONL file of normalized LLM calls.
 *
 * The ledger is the only durable state the dashboard needs. Records are keyed
 * by a stable id — `sessionId#seq` for session events, `compaction:<id>` for a
 * compaction summary, `title:<ts>:<n>` for a title request — so live capture
 * and the history backfill can both run without double counting.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const MAX_RECORDS = 300_000

function num(value) {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** Normalize a candidate record; returns null when it carries no usage. */
export function normalizeRecord(input) {
  if (!input || typeof input !== 'object') return null
  const inputTokens = num(input.input)
  const outputTokens = num(input.output)
  const cacheRead = num(input.cacheRead)
  const cacheWrite = num(input.cacheWrite)
  const total = num(input.total) || inputTokens + outputTokens + cacheRead + cacheWrite
  if (total <= 0) return null
  const id = String(input.id || '')
  if (!id) return null
  const ts = Number(input.ts)
  if (!Number.isFinite(ts) || ts <= 0) return null
  return {
    id,
    ts: Math.round(ts),
    provider: String(input.provider || ''),
    model: String(input.model || ''),
    input: inputTokens,
    output: outputTokens,
    cacheRead,
    cacheWrite,
    total,
    kind: String(input.kind || 'turn'),
    ...(input.sid === undefined ? {} : { sid: String(input.sid) }),
    ...(input.seq === undefined ? {} : { seq: Number(input.seq) }),
  }
}

export class Ledger {
  /** @param {string} dir - private storage directory. */
  constructor(dir) {
    this.dir = dir
    this.file = join(dir, 'events.jsonl')
    /** @type {Map<string, object>} */
    this.byId = new Map()
    /** @type {object[]} */
    this.records = []
    this.dirty = false
  }

  load() {
    mkdirSync(this.dir, { recursive: true })
    if (!existsSync(this.file)) return this
    let text = ''
    try {
      text = readFileSync(this.file, 'utf8')
    } catch {
      return this
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      const record = normalizeRecord(parsed)
      if (record === null || this.byId.has(record.id)) continue
      this.byId.set(record.id, record)
      this.records.push(record)
    }
    return this
  }

  has(id) {
    return this.byId.has(id)
  }

  get size() {
    return this.records.length
  }

  /** Append one record; returns false when the id was already present. */
  add(record) {
    const normalized = normalizeRecord(record)
    if (normalized === null || this.byId.has(normalized.id)) return false
    this.byId.set(normalized.id, normalized)
    this.records.push(normalized)
    this.appendLines([normalized])
    this.enforceCap()
    return true
  }

  /** Append many records in one write; returns how many were new. */
  addMany(candidates) {
    const fresh = []
    for (const candidate of candidates) {
      const normalized = normalizeRecord(candidate)
      if (normalized === null || this.byId.has(normalized.id)) continue
      this.byId.set(normalized.id, normalized)
      this.records.push(normalized)
      fresh.push(normalized)
    }
    if (fresh.length > 0) this.appendLines(fresh)
    this.enforceCap()
    return fresh.length
  }

  appendLines(records) {
    try {
      mkdirSync(this.dir, { recursive: true })
      appendFileSync(this.file, records.map((record) => JSON.stringify(record)).join('\n') + '\n')
    } catch (error) {
      this.dirty = true
      console.warn('[dsh-usage-insights] ledger append failed:', error && error.message ? error.message : error)
    }
  }

  /** Bound memory and disk growth by dropping the oldest records. */
  enforceCap() {
    if (this.records.length <= MAX_RECORDS) return
    const drop = this.records.length - MAX_RECORDS
    const removed = this.records.splice(0, drop)
    for (const record of removed) this.byId.delete(record.id)
    this.rewrite()
  }

  rewrite() {
    try {
      const temp = `${this.file}.${process.pid}.tmp`
      writeFileSync(temp, this.records.map((record) => JSON.stringify(record)).join('\n') + '\n')
      renameSync(temp, this.file)
      this.dirty = false
    } catch (error) {
      console.warn('[dsh-usage-insights] ledger rewrite failed:', error && error.message ? error.message : error)
    }
  }

  recordsInRange(startTs) {
    if (!Number.isFinite(startTs) || startTs <= 0) return this.records.slice()
    const result = []
    for (const record of this.records) if (record.ts >= startTs) result.push(record)
    return result
  }

  firstTs() {
    let first = Infinity
    for (const record of this.records) if (record.ts < first) first = record.ts
    return Number.isFinite(first) ? first : null
  }
}

/** Read a file's size and mtime without throwing. */
export function fileStamp(file) {
  try {
    const stat = statSync(file)
    return { size: stat.size, mtime: Math.round(stat.mtimeMs) }
  } catch {
    return null
  }
}

/** Keep the backfill cursor file compact and atomic. */
export function writeJsonAtomic(file, value) {
  mkdirSync(join(file, '..'), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(value, null, 2))
  renameSync(temp, file)
}

/** Read a whole file without throwing. */
export function readFileOrNull(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}
