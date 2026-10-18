/**
 * Query projection: turn ledger records into the snapshot the settings page
 * renders — totals, a per-day series, per-model breakdowns, provider totals,
 * and the recent-request list.
 *
 * Costs are not stored on records: they are recomputed here from the current
 * price book, so editing a price immediately re-values history.
 */
import { costOf, isOfficialProvider } from './pricing.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Local-calendar day key (`YYYY-MM-DD`) for a timestamp. */
export function dayKey(ts) {
  const date = new Date(ts)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Local midnight of the day containing `ts`. */
export function startOfDay(ts) {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function addDays(ts, days) {
  const date = new Date(ts)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

function money(value) {
  return Math.round(value * 1e6) / 1e6
}

/** Circular-free helper for the requested range. */
function resolveRange(ledger, days, now) {
  const today = startOfDay(now)
  if (days > 0) {
    return { start: addDays(today, -(days - 1)), end: now, capped: false }
  }
  const first = ledger.firstTs()
  if (first === null) return { start: today, end: now, capped: false }
  const firstDay = startOfDay(first)
  const earliest = addDays(today, -365)
  return { start: Math.max(firstDay, earliest), end: now, capped: firstDay < earliest }
}

/** All model/provider facets over the whole ledger, for stable filters. */
function facets(ledger) {
  const providers = new Map()
  const models = new Map()
  for (const record of ledger.records) {
    const provider = record.provider || 'unknown'
    const model = record.model || 'unknown'
    if (!providers.has(provider)) providers.set(provider, { id: provider, official: isOfficialProvider(provider), models: new Set() })
    providers.get(provider).models.add(model)
    if (!models.has(model)) models.set(model, { name: model, providers: new Set() })
    models.get(model).providers.add(provider)
  }
  return {
    providers: [...providers.values()]
      .map((entry) => ({ id: entry.id, official: entry.official, models: [...entry.models].sort() }))
      .sort((a, b) => Number(b.official) - Number(a.official) || a.id.localeCompare(b.id)),
    models: [...models.values()]
      .map((entry) => ({ name: entry.name, providers: [...entry.providers].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

function matchesProvider(record, filter) {
  if (!filter || filter === 'all') return true
  if (filter === 'official') return isOfficialProvider(record.provider)
  if (filter === 'third') return !isOfficialProvider(record.provider)
  return record.provider === filter
}

/**
 * Build the dashboard snapshot.
 * @param {import('./ledger.js').Ledger} ledger
 * @param {import('./pricing.js').PriceBook} prices
 * @param {{days?: number, provider?: string, model?: string, now?: number, backfill?: object}} options
 */
export function summarize(ledger, prices, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const days = Number.isFinite(options.days) && options.days > 0 ? Math.floor(options.days) : 0
  const providerFilter = typeof options.provider === 'string' ? options.provider : 'all'
  const modelFilter = typeof options.model === 'string' ? options.model : 'all'
  const range = resolveRange(ledger, days, now)
  const axis = []
  const label = []
  for (let cursor = startOfDay(range.start); cursor <= range.end; cursor = addDays(cursor, 1)) {
    axis.push(dayKey(cursor))
    const date = new Date(cursor)
    label.push(`${date.getMonth() + 1}/${date.getDate()}`)
  }
  const indexOfDay = new Map(axis.map((key, index) => [key, index]))
  const emptySeries = () => new Array(axis.length).fill(0)

  const totals = {
    cost: 0,
    requests: 0,
    tokens: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    officialCost: 0,
    thirdCost: 0,
  }
  const series = axis.map((day) => ({ day, cost: 0, requests: 0, tokens: 0, input: 0, output: 0 }))
  const models = new Map()
  const providers = new Map()
  const sessions = new Set()
  const recent = []

  for (const record of ledger.records) {
    if (record.ts < range.start || record.ts > range.end) continue
    if (!matchesProvider(record, providerFilter)) continue
    if (modelFilter !== 'all' && record.model !== modelFilter) continue
    const price = prices.effective(record.model, record.ts, record.provider)
    const cost = costOf(record, price)
    const dayIndex = indexOfDay.get(dayKey(record.ts))
    if (dayIndex === undefined) continue

    totals.cost += cost
    totals.requests += 1
    totals.tokens += record.total
    totals.input += record.input
    totals.output += record.output
    totals.cacheRead += record.cacheRead
    totals.cacheWrite += record.cacheWrite
    if (isOfficialProvider(record.provider)) totals.officialCost += cost
    else totals.thirdCost += cost
    if (record.sid) sessions.add(record.sid)

    const day = series[dayIndex]
    day.cost += cost
    day.requests += 1
    day.tokens += record.total
    day.input += record.input
    day.output += record.output

    const modelName = record.model || 'unknown'
    if (!models.has(modelName)) {
      models.set(modelName, {
        model: modelName,
        providers: new Set(),
        cost: 0,
        requests: 0,
        tokens: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        series: { requests: emptySeries(), tokens: emptySeries(), cost: emptySeries() },
        price,
      })
    }
    const model = models.get(modelName)
    model.providers.add(record.provider || 'unknown')
    model.cost += cost
    model.requests += 1
    model.tokens += record.total
    model.input += record.input
    model.output += record.output
    model.cacheRead += record.cacheRead
    model.cacheWrite += record.cacheWrite
    model.series.requests[dayIndex] += 1
    model.series.tokens[dayIndex] += record.total
    model.series.cost[dayIndex] += cost
    model.price = prices.effective(modelName, now, record.provider)

    const providerName = record.provider || 'unknown'
    if (!providers.has(providerName)) {
      providers.set(providerName, {
        id: providerName,
        official: isOfficialProvider(providerName),
        cost: 0,
        requests: 0,
        tokens: 0,
        models: new Set(),
      })
    }
    const provider = providers.get(providerName)
    provider.cost += cost
    provider.requests += 1
    provider.tokens += record.total
    provider.models.add(modelName)

    recent.push(record)
  }

  recent.sort((left, right) => right.ts - left.ts)
  const recentRows = recent.slice(0, 40).map((record) => {
    const price = prices.effective(record.model, record.ts, record.provider)
    return {
      ts: record.ts,
      model: record.model,
      provider: record.provider,
      kind: record.kind,
      tokens: record.total,
      input: record.input,
      output: record.output,
      cacheRead: record.cacheRead,
      cost: money(costOf(record, price)),
      peak: price.peak,
    }
  })

  const modelRows = [...models.values()]
    .map((model) => ({
      model: model.model,
      providers: [...model.providers].sort(),
      official: [...model.providers].some((provider) => isOfficialProvider(provider)),
      cost: money(model.cost),
      requests: model.requests,
      tokens: model.tokens,
      input: model.input,
      output: model.output,
      cacheRead: model.cacheRead,
      cacheWrite: model.cacheWrite,
      series: {
        requests: model.series.requests,
        tokens: model.series.tokens,
        cost: model.series.cost.map(money),
      },
      price: { hit: model.price.hit, miss: model.price.miss, out: model.price.out, custom: model.price.custom },
    }))
    .sort((left, right) => right.cost - left.cost || right.tokens - left.tokens)

  const providerRows = [...providers.values()]
    .map((provider) => ({
      id: provider.id,
      official: provider.official,
      cost: money(provider.cost),
      requests: provider.requests,
      tokens: provider.tokens,
      models: [...provider.models].sort(),
    }))
    .sort((left, right) => right.cost - left.cost || right.tokens - left.tokens)

  const available = facets(ledger)

  if (options.rows === true) {
    const rows = []
    for (const record of ledger.records) {
      if (record.ts < range.start || record.ts > range.end) continue
      if (!matchesProvider(record, providerFilter)) continue
      if (modelFilter !== 'all' && record.model !== modelFilter) continue
      const price = prices.effective(record.model, record.ts, record.provider)
      rows.push({
        ts: record.ts,
        provider: record.provider,
        model: record.model,
        kind: record.kind,
        input: record.input,
        cacheRead: record.cacheRead,
        cacheWrite: record.cacheWrite,
        output: record.output,
        tokens: record.total,
        cost: money(costOf(record, price)),
        peak: price.peak,
      })
    }
    rows.sort((left, right) => right.ts - left.ts)
    return rows
  }

  return {
    currency: 'CNY',
    range: {
      days,
      start: range.start,
      end: range.end,
      capped: range.capped,
      label: days > 0 ? `最近 ${days} 天` : '全部时间',
    },
    axis: { days: axis, labels: label },
    totals: {
      ...totals,
      cost: money(totals.cost),
      officialCost: money(totals.officialCost),
      thirdCost: money(totals.thirdCost),
      models: modelRows.length,
      sessions: sessions.size,
    },
    series: series.map((day) => ({ ...day, cost: money(day.cost) })),
    models: modelRows,
    providers: providerRows,
    recent: recentRows,
    available,
    meta: {
      generatedAt: now,
      events: ledger.size,
      firstDay: ledger.firstTs() === null ? null : dayKey(ledger.firstTs()),
      backfill: options.backfill || null,
      pricing: prices.snapshot(),
    },
  }
}
