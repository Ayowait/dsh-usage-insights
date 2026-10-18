/**
 * Price book for the usage dashboard.
 *
 * Rates are CNY per million tokens. DeepSeek's official API bills peak hours
 * (Beijing time, Monday–Friday 09:00–12:00 and 14:00–18:00) at twice the
 * off-peak rate, so `effectivePrice` folds the timestamp into the returned
 * rates. Every other provider has no public peak schedule and is priced flat.
 *
 * Third-party routes get the Flash base rate by default: a usable estimate
 * rather than a fabricated promise. The page states that, and a per-model
 * override can replace it.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'

const FLASH = Object.freeze({ hit: 0.02, miss: 1, out: 4 })
const PRO = Object.freeze({ hit: 0.15, miss: 4.5, out: 13.5 })

/** Built-in model-name fragments, longest first at lookup time. */
const BUILTIN = [
  ['deepseek-v4-pro', PRO],
  ['deepseek-reasoner', PRO],
  ['deepseek-v4.1-pro', PRO],
  ['deepseek-v4-flash', FLASH],
  ['deepseek-v4.1-flash', FLASH],
  ['deepseek-v4-flash-vision-exp', FLASH],
  ['deepseek-flash', FLASH],
  ['deepseek-chat', FLASH],
]

export const DEFAULT_PRICE = FLASH

/** Providers that bill at the official DeepSeek schedule. */
export function isOfficialProvider(provider) {
  const name = String(provider || '')
  return name === 'deepseek' || name === 'deepseek-account' || name === 'deepseek-api-key' || name.startsWith('deepseek-')
}

/** Beijing wall-clock parts (UTC+8, no DST). */
function beijing(ts) {
  const date = new Date(ts + 8 * 60 * 60 * 1000)
  return { weekday: date.getUTCDay(), hour: date.getUTCHours() }
}

/** Official DeepSeek peak window: Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing. */
export function isPeak(ts) {
  const { weekday, hour } = beijing(ts)
  if (weekday === 0 || weekday === 6) return false
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

/** Basis points helpers keep override comparisons tolerant of float noise. */
function round6(value) {
  return Math.round(value * 1e6) / 1e6
}

export class PriceBook {
  /** @param {string} file - JSON file holding user overrides. */
  constructor(file) {
    this.file = file
    /** @type {Record<string, {hit:number,miss:number,out:number}>} */
    this.overrides = {}
    this.load()
  }

  load() {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      this.overrides = normalizeOverrides(raw && raw.models)
    } catch {
      this.overrides = {}
    }
  }

  /** Replace one model's override (or drop it when `null`). */
  set(model, price) {
    const name = String(model || '').trim().toLowerCase()
    if (!name) throw new Error('model is required')
    if (price === null) delete this.overrides[name]
    else this.overrides[name] = sanitizePrice(price)
    this.save()
    return this.snapshot()
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true })
    const payload = JSON.stringify({ version: 1, currency: 'CNY', models: this.overrides }, null, 2)
    const temp = `${this.file}.${process.pid}.tmp`
    writeFileSync(temp, payload)
    renameSync(temp, this.file)
  }

  snapshot() {
    return { currency: 'CNY', models: { ...this.overrides } }
  }

  /**
   * Effective rates for one call.
   * @param {string} model
   * @param {number} ts
   * @param {string} provider
   * @returns {{hit:number, miss:number, out:number, peak:boolean, official:boolean, custom:boolean, source:string}}
   */
  effective(model, ts, provider) {
    const name = String(model || '').toLowerCase()
    const custom = this.findOverride(name)
    if (custom !== null) {
      return { ...custom, peak: false, official: isOfficialProvider(provider), custom: true, source: 'custom' }
    }
    const official = isOfficialProvider(provider)
    let base = DEFAULT_PRICE
    let source = 'default'
    if (name.includes('deepseek')) {
      for (const [fragment, price] of BUILTIN) {
        if (name.includes(fragment)) {
          base = price
          source = 'deepseek'
          break
        }
      }
    }
    if (source === 'deepseek' && official && isPeak(ts)) {
      return { hit: round6(base.hit * 2), miss: round6(base.miss * 2), out: round6(base.out * 2), peak: true, official, custom: false, source }
    }
    return { ...base, peak: false, official, custom: false, source }
  }

  findOverride(name) {
    if (!name) return null
    if (this.overrides[name]) return this.overrides[name]
    let best = null
    for (const key of Object.keys(this.overrides)) {
      if (key && name.includes(key) && (best === null || key.length > best.length)) best = key
    }
    return best === null ? null : this.overrides[best]
  }

  /** The effective price a model would carry right now (off-peak base). */
  display(model, provider) {
    const price = this.effective(model, Date.now(), provider)
    return { hit: price.hit, miss: price.miss, out: price.out, custom: price.custom, peak: price.peak }
  }
}

function normalizeOverrides(value) {
  const result = {}
  if (!value || typeof value !== 'object') return result
  for (const [key, price] of Object.entries(value)) {
    try {
      result[String(key).toLowerCase()] = sanitizePrice(price)
    } catch {
      // A corrupt row is dropped rather than breaking the whole book.
    }
  }
  return result
}

function sanitizePrice(price) {
  const hit = numberOrThrow(price && price.hit, 'hit')
  const miss = numberOrThrow(price && price.miss, 'miss')
  const out = numberOrThrow(price && price.out, 'out')
  return { hit, miss, out }
}

function numberOrThrow(value, field) {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new Error(`${field} must be a number between 0 and 1000000`)
  }
  return round6(n)
}

/** CNY cost of one recorded call. */
export function costOf(record, price) {
  const miss = (record.input || 0) + (record.cacheWrite || 0)
  const hit = record.cacheRead || 0
  const out = record.output || 0
  return (hit * price.hit + miss * price.miss + out * price.out) / 1e6
}
