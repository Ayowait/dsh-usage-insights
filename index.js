/**
 * dsh-usage-insights — Host half.
 *
 * Records every model call the Harness makes, whichever route serves it:
 * - `session/event` delivers the durable assistant messages (turn usage) and
 *   compaction summaries, including sessions run by subagents.
 * - the `llm/stream` waterfall taps the calls that never become an assistant
 *   message — session-title requests — so the request count is complete.
 *
 * A one-time history backfill folds existing session logs into the ledger, so
 * the page is populated the moment it opens. The page itself is a Client
 * plugin served from `./client`; this half only stores data and answers the
 * JSON API under `/dsh-usage/api/v1`.
 */
import { join } from 'node:path'
import { Ledger } from './lib/ledger.js'
import { PriceBook } from './lib/pricing.js'
import { Backfill } from './lib/sessions.js'
import { mountUsageRoutes } from './lib/routes.js'
import { dataDir } from './lib/paths.js'

/** Shape one assistant message's usage into a ledger record. */
function fromAssistantMessage(sessionId, event) {
  const usage = event.data && event.data.usage
  const source = event.data && event.data.message && event.data.message.source
  if (!usage || !source || source.kind !== 'model') return null
  const id = `${sessionId}#${event.seq}`
  return {
    id,
    ts: event.time,
    sid: sessionId,
    seq: event.seq,
    provider: source.provider,
    model: source.model,
    input: usage.inputTokens,
    output: usage.outputTokens,
    cacheRead: usage.cacheReadTokens,
    cacheWrite: usage.cacheWriteTokens,
    total: usage.totalTokens,
    kind: 'turn',
  }
}

/** Compaction summaries are a model call too, and carry their own usage. */
function fromCompaction(sessionId, event) {
  const data = event.data || {}
  if (!data.usage || !data.compactionId) return null
  return {
    id: `compaction:${data.compactionId}`,
    ts: event.time,
    sid: sessionId,
    provider: data.provider,
    model: data.model,
    input: data.usage.inputTokens,
    output: data.usage.outputTokens,
    cacheRead: data.usage.cacheReadTokens,
    cacheWrite: data.usage.cacheWriteTokens,
    total: data.usage.totalTokens,
    kind: 'compaction',
  }
}

export function apply(ctx) {
  const dir = dataDir()
  const ledger = new Ledger(dir).load()
  const prices = new PriceBook(join(dir, 'pricing.json'))
  const backfill = new Backfill(ledger, join(dir, 'backfill.json'))
  const log = (level, message) => {
    try {
      const logger = ctx.logger
      if (logger && typeof logger[level] === 'function') logger[level](`[dsh-usage-insights] ${message}`)
    } catch {
      // Logging must never break recording.
    }
  }

  ctx.on('session/event', (session, event) => {
    try {
      if (!event || !event.type || !session) return
      const sessionId = String(session.id || '')
      if (!sessionId) return
      if (event.type === 'assistant/message') {
        const record = fromAssistantMessage(sessionId, event)
        if (record !== null) ledger.add(record)
        return
      }
      if (event.type === 'compaction/summary') {
        const record = fromCompaction(sessionId, event)
        if (record !== null) ledger.add(record)
      }
    } catch (error) {
      log('warn', `record failed: ${error && error.message ? error.message : error}`)
    }
  })

  // Session-title requests never become an assistant message, so they are
  // tapped at the stream waterfall instead of the session log.
  let titleSeq = 0
  ctx.on('llm/stream', (options, next) => {
    if (!options || options.purpose !== 'session-title') return next()
    const iterable = next()
    const started = Date.now()
    return (async function* tap() {
      let usage = null
      try {
        for await (const chunk of iterable) {
          if (chunk && chunk.type === 'usage') usage = chunk.usage
          yield chunk
        }
      } finally {
        if (usage) {
          titleSeq += 1
          try {
            ledger.add({
              id: `title:${started}:${titleSeq}`,
              ts: started,
              provider: options.provider,
              model: options.model,
              input: usage.inputTokens,
              output: usage.outputTokens,
              cacheRead: usage.cacheReadTokens,
              cacheWrite: usage.cacheWriteTokens,
              total: usage.totalTokens,
              kind: 'title',
            })
          } catch (error) {
            log('warn', `title record failed: ${error && error.message ? error.message : error}`)
          }
        }
      }
    })()
  })

  ctx.inject(['webServer'], (web) => {
    web.effect(() => mountUsageRoutes(web, { ledger, prices, backfill }), 'dsh-usage-insights: http routes')
    log('info', `ready (${ledger.size} recorded calls)`)
  })

  // Fold existing session logs into the ledger, then keep watching for logs
  // written by another Harness process. The cursor file makes both cheap.
  ctx.effect(() => {
    backfill.start()
    const timer = setInterval(() => {
      if (!backfill.running) backfill.start()
    }, 10 * 60 * 1000)
    if (typeof timer.unref === 'function') timer.unref()
    return () => clearInterval(timer)
  }, 'dsh-usage-insights: history backfill')
}

export const name = 'dsh-usage-insights'
