// Shared Vercel AI Gateway client + JSON helpers for /api/works/* edge functions.
// Requires env var AI_GATEWAY_API_KEY (set via Vercel dashboard or `vercel env add`).

const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-4o-mini'

export async function complete({ system, user, model = DEFAULT_MODEL, temperature = 0.6, max_tokens = 1200 }) {
  const key = process.env.AI_GATEWAY_API_KEY
  if (!key) throw httpError('missing_api_key', 500)

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[ai-gateway]', res.status, body.slice(0, 500))
    throw httpError('llm_failed', 502, { upstream: res.status, upstream_body: body.slice(0, 400) })
  }

  const json = await res.json()
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    usage: json.usage ?? null,
  }
}

function httpError(code, status, extra = {}) {
  const e = new Error(code)
  e.code = code
  e.status = status
  Object.assign(e, extra)
  return e
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Standard error envelope used by all /api/works/* endpoints
export function errorResponse(err) {
  const status = err?.status || 500
  const body = { ok: false, error: err?.code || 'internal_error' }
  if (err?.upstream) body.upstream = err.upstream
  if (err?.upstream_body) body.upstream_body = err.upstream_body
  return jsonResponse(body, status)
}

export const Method = {
  notAllowed: () => jsonResponse({ ok: false, error: 'method_not_allowed' }, 405),
  badRequest: (msg = 'invalid_request') => jsonResponse({ ok: false, error: msg }, 400),
}

// Wrap a request handler with method gate + JSON parse + uniform error handling
export function createHandler({ method = 'POST', handle }) {
  return async (req) => {
    if (req.method !== method) return Method.notAllowed()
    let data
    try {
      data = await req.json()
    } catch {
      return Method.badRequest('invalid_json')
    }
    try {
      const result = await handle(data, req)
      return jsonResponse({ ok: true, ...result })
    } catch (err) {
      console.error('[handler]', err?.message || err)
      return errorResponse(err)
    }
  }
}
