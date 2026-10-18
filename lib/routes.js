/**
 * HTTP surface for the settings page. Read-only except `/pricing` (unit-price
 * overrides) and `/backfill` (rescan), both same-origin POSTs.
 */
import { summarize } from './aggregate.js'

const PREFIX = '/dsh-usage/api/v1'

function sendJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function sendError(response, status, message) {
  sendJson(response, status, { error: String(message) })
}

function query(request) {
  try {
    return new URL(request.url, 'http://127.0.0.1')
  } catch {
    return new URL('http://127.0.0.1/')
  }
}

function readQuery(request) {
  const url = query(request)
  const daysRaw = Number(url.searchParams.get('days'))
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(3650, Math.floor(daysRaw)) : 30
  const provider = url.searchParams.get('provider') || 'all'
  const model = url.searchParams.get('model') || 'all'
  return { url, days, provider, model }
}

function readBody(request, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text.trim() === '' ? {} : JSON.parse(text))
      } catch (error) {
        reject(new Error('invalid JSON body'))
      }
    })
    request.on('error', reject)
  })
}

/** Same-origin for browser POSTs; plain loopback clients without Origin pass. */
function trusted(request) {
  const origin = request.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

function csvCell(value) {
  const text = String(value === undefined || value === null ? '' : value)
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

function csvOf(rows) {
  const header = ['时间', '接口', '模型', '类型', '输入', '缓存命中', '缓存写入', '输出', '合计', '费用(CNY)', '峰时']
  const lines = [header.join(',')]
  for (const row of rows) {
    const stamp = new Date(row.ts)
    const time = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}`
    lines.push([
      time,
      row.provider,
      row.model,
      row.kind,
      row.input,
      row.cacheRead,
      row.cacheWrite,
      row.output,
      row.tokens,
      row.cost.toFixed(6),
      row.peak ? '是' : '',
    ].map(csvCell).join(','))
  }
  return '\ufeff' + lines.join('\r\n')
}

/**
 * Register the routes on an injected webServer context.
 * @param {{webServer: {register(route: object): () => void}}} web
 * @param {{ledger: object, prices: object, backfill: object}} deps
 * @returns {() => void} disposer that unregisters every route
 */
export function mountUsageRoutes(web, deps) {
  const { ledger, prices, backfill } = deps
  const disposers = []

  disposers.push(web.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/summary`,
    handler: (request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET' })
        response.end()
        return
      }
      try {
        const { url, days, provider, model } = readQuery(request)
        if (url.searchParams.get('rescan') === '1') backfill.start()
        sendJson(response, 200, summarize(ledger, prices, {
          days,
          provider,
          model,
          backfill: backfill.status(),
        }))
      } catch (error) {
        sendError(response, 500, error && error.message ? error.message : error)
      }
    },
  }))

  disposers.push(web.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/pricing`,
    handler: async (request, response) => {
      if (request.method === 'GET') {
        try {
          const all = summarize(ledger, prices, { days: 0, backfill: backfill.status() })
          sendJson(response, 200, {
            currency: 'CNY',
            unit: '元 / 百万 tokens',
            defaults: { hit: 0.02, miss: 1, out: 4 },
            overrides: prices.snapshot().models,
            models: all.models.map((model) => ({
              model: model.model,
              providers: model.providers,
              official: model.official,
              requests: model.requests,
              tokens: model.tokens,
              cost: model.cost,
              price: model.price,
            })),
          })
        } catch (error) {
          sendError(response, 500, error && error.message ? error.message : error)
        }
        return
      }
      if (request.method !== 'POST') {
        response.writeHead(405, { allow: 'GET, POST' })
        response.end()
        return
      }
      if (!trusted(request)) {
        sendError(response, 403, 'untrusted origin')
        return
      }
      try {
        const body = await readBody(request)
        const model = typeof body.model === 'string' ? body.model : ''
        if (!model) throw new Error('model is required')
        if (body.reset === true) prices.set(model, null)
        else prices.set(model, { hit: body.hit, miss: body.miss, out: body.out })
        sendJson(response, 200, {
          ok: true,
          model,
          price: prices.display(model, ''),
          overrides: prices.snapshot().models,
        })
      } catch (error) {
        sendError(response, 400, error && error.message ? error.message : error)
      }
    },
  }))

  disposers.push(web.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/export`,
    handler: (request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET' })
        response.end()
        return
      }
      try {
        const { days, provider, model } = readQuery(request)
        const rows = summarize(ledger, prices, { days, provider, model, rows: true })
        const csv = csvOf(rows)
        const stamp = new Date()
        const name = `dsh-usage-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.csv`
        response.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${name}"`,
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(csv),
        })
        response.end(csv)
      } catch (error) {
        sendError(response, 500, error && error.message ? error.message : error)
      }
    },
  }))

  disposers.push(web.webServer.register({
    kind: 'exact',
    path: `${PREFIX}/backfill`,
    handler: (request, response) => {
      if (request.method !== 'POST') {
        response.writeHead(405, { allow: 'POST' })
        response.end()
        return
      }
      if (!trusted(request)) {
        sendError(response, 403, 'untrusted origin')
        return
      }
      backfill.start()
      sendJson(response, 200, { ok: true, backfill: backfill.status() })
    },
  }))

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // A route already gone is the desired end state.
      }
    }
  }
}
