// Vercel Edge Function — receives diagnose form submissions and forwards via Resend.
// Required env var: RESEND_API_KEY (set in Vercel dashboard → Settings → Environment Variables).

export const config = { runtime: 'edge' }

const TO = 'hamada.phasera@gmail.com'
const FROM = 'Phasera <onboarding@resend.dev>' // switch to noreply@phasera.jp after domain verification in Resend
const MAX_LEN = { name: 100, email: 200, industry: 64, message: 4000 }

const escape = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_api_key' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  let data
  try {
    data = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const name = String(data.name || '').trim()
  const email = String(data.email || '').trim()
  const industry = String(data.industry || '').trim()
  const message = String(data.message || '').trim()

  if (!name || name.length > MAX_LEN.name) return bad('invalid_name')
  if (!email || email.length > MAX_LEN.email || !isEmail(email)) return bad('invalid_email')
  if (!industry || industry.length > MAX_LEN.industry) return bad('invalid_industry')
  if (message.length > MAX_LEN.message) return bad('message_too_long')

  const subject = `【Phasera 診断申込】${name}`
  const text = [
    'Phasera 診断オーディットへの申込みです。',
    '',
    '────────────────',
    `お名前  : ${name}`,
    `メール  : ${email}`,
    `業種    : ${industry}`,
    '────────────────',
    '',
    '相談したいこと:',
    message || '（未記入）',
    '',
    '────────────────',
    '※ このメールは https://phasera.jp の申込フォームから自動送信されました。',
  ].join('\n')

  const html =
    `<p>Phasera 診断オーディットへの申込みです。</p>` +
    `<table style="border-collapse:collapse;font-family:system-ui,-apple-system,sans-serif;font-size:14px">` +
    `<tr><td style="padding:6px 12px;color:#666">お名前</td><td style="padding:6px 12px"><b>${escape(name)}</b></td></tr>` +
    `<tr><td style="padding:6px 12px;color:#666">メール</td><td style="padding:6px 12px"><a href="mailto:${escape(email)}">${escape(email)}</a></td></tr>` +
    `<tr><td style="padding:6px 12px;color:#666">業種</td><td style="padding:6px 12px">${escape(industry)}</td></tr>` +
    `</table>` +
    `<p style="font-size:13px;color:#666;margin-top:18px">相談したいこと</p>` +
    `<div style="white-space:pre-wrap;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.7;border-left:3px solid #4A6FA8;padding:8px 14px;background:#f6f8fc">${escape(message || '（未記入）')}</div>` +
    `<p style="font-size:11px;color:#999;margin-top:24px">— このメールは <a href="https://phasera.jp">phasera.jp</a> の申込フォームから自動送信されました。</p>`

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: email,
      subject,
      text,
      html,
    }),
  })

  if (!resendRes.ok) {
    const body = await resendRes.text().catch(() => '')
    console.error('Resend error', resendRes.status, body)
    return new Response(JSON.stringify({ ok: false, error: 'send_failed', status: resendRes.status }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }

  const json = await resendRes.json().catch(() => ({}))
  return new Response(JSON.stringify({ ok: true, id: json.id || null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function bad(error) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  })
}
