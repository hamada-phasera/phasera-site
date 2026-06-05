// Edge runtime, POST endpoint for the 問い合わせ自動応答エージェント demo.
// Input: { industry: string, tone: string, inquiry: string }
// Output: { ok: true, text: string, usage } where text starts with "件名: ..." then body

import { complete, jsonResponse, Method, errorResponse } from '../../lib/ai-gateway.mjs'

export const config = { runtime: 'edge' }

const SYSTEM_PROMPT = `あなたは中小企業のバックオフィス担当アシスタントです。新規お問い合わせメールに対する一次返信メールの下書きを作成します。

# 厳守ルール
1. 必ず日本語のビジネスメールとして自然な文体で書く
2. 出力フォーマットは以下に厳密に従う:
   件名: <件名を一行で>
   <空行>
   <本文。冒頭の敬称、自己紹介、お礼、内容に対する一次反応、次のステップ、結びの順>
3. 業種に合わせた専門用語の使い方を意識する（士業なら「ご相談」、人材派遣なら「ご案件」など）
4. トーンが「丁寧」なら標準ビジネス敬語、「フランク」なら一段やわらかい表現にする
5. 必ず最後に「※ この返信は AI による下書きです。送信前に内容をご確認ください。」の一文を入れる
6. 推測で確約しない（「〜の件で承知しました」とは書かず「〜の件、確認の上でご連絡します」）
7. 個人情報や金額の確約はしない
8. 差出人名は「[担当者名]」のようなプレースホルダにし、勝手に固有名詞を作らない`

const MAX_INQUIRY = 4000
const MIN_INQUIRY = 10

const ALLOWED_INDUSTRIES = new Set([
  '士業',
  '人材派遣',
  'クリニック・サロン',
  '飲食',
  'クリエイティブ',
  'その他',
])

const ALLOWED_TONES = new Set([
  '丁寧（標準）',
  'フランク（少しカジュアル）',
])

export default async function handler(req) {
  if (req.method !== 'POST') return Method.notAllowed()

  let data
  try {
    data = await req.json()
  } catch {
    return Method.badRequest('invalid_json')
  }

  const industry = String(data.industry || '').trim()
  const tone = String(data.tone || '').trim()
  const inquiry = String(data.inquiry || '').trim()

  if (!industry) return Method.badRequest('missing_industry')
  if (!ALLOWED_INDUSTRIES.has(industry)) return Method.badRequest('invalid_industry')
  if (!tone) return Method.badRequest('missing_tone')
  if (!ALLOWED_TONES.has(tone)) return Method.badRequest('invalid_tone')
  if (inquiry.length < MIN_INQUIRY) return Method.badRequest('inquiry_too_short')
  if (inquiry.length > MAX_INQUIRY) return Method.badRequest('inquiry_too_long')

  const user = [
    `業種: ${industry}`,
    `トーン: ${tone}`,
    '',
    '受信した問い合わせ本文:',
    '────',
    inquiry,
    '────',
    '',
    '上記の問い合わせに対する一次返信メールを、件名と本文を含めて下書きしてください。',
  ].join('\n')

  try {
    const { text, usage } = await complete({
      system: SYSTEM_PROMPT,
      user,
      temperature: 0.5,
      max_tokens: 900,
    })
    return jsonResponse({ ok: true, text, usage })
  } catch (err) {
    return errorResponse(err)
  }
}
