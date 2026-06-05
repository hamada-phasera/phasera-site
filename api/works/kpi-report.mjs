// Edge runtime, POST endpoint for the 経営指標レポート生成エージェント demo.
// Input: { industry: string, kpis: string, notes?: string }
// Output: { ok: true, text: string, usage } where text is a markdown-style report
// with ## headers: サマリ / 注目すべき変化 / 来月の打ち手（3つ）/ 注意事項

import { complete, jsonResponse, Method, errorResponse } from '../../lib/ai-gateway.mjs'

export const config = { runtime: 'edge' }

const SYSTEM_PROMPT = `あなたは中小企業の経営者向けに月次経営レポートを生成するアシスタントです。受け取った KPI 数値表と補足から、15-20 分で読める形に要約します。

# 厳守ルール
1. 出力は必ず以下のフォーマットに従う:
   ## サマリ（3行以内）
   <主な変化を3行で>

   ## 注目すべき変化
   - <指標名>: <変化と数字根拠> ※必ず数字を引用する
   - <指標名>: <変化と数字根拠>
   - <指標名>: <変化と数字根拠>

   ## 来月の打ち手（3つ）
   1. <着手可能な具体行動> — 期待効果: <仮説>
   2. <着手可能な具体行動> — 期待効果: <仮説>
   3. <着手可能な具体行動> — 期待効果: <仮説>

   ## 注意事項
   <データの欠落や前提のズレがあれば指摘>
2. 数字根拠を必ず引用（「売上は前月820万→今月940万、+14.6%」など具体的に）
3. 推測は「仮説」と明記、「〜と推測される」「〜の可能性がある」と書く
4. 打ち手は来月から着手できる具体性で（「マーケ強化」ではなく「Web広告を月10万円→月15万円に増額」など）
5. 業種特性を考慮（士業なら受注率と単価、人材派遣ならマッチング数と歩留まりなど）
6. 数字に矛盾や明らかな入力ミスを発見したら「注意事項」で指摘`

const MAX_FIELD = 3000
const MAX_NOTES = 1500
const MIN_KPIS = 20

export default async function handler(req) {
  if (req.method !== 'POST') return Method.notAllowed()

  let data
  try {
    data = await req.json()
  } catch {
    return Method.badRequest('invalid_json')
  }

  const industry = String(data.industry || '').trim()
  const kpis = String(data.kpis || '').trim()
  const notes = String(data.notes || '').trim()

  if (!industry) return Method.badRequest('missing_industry')
  if (kpis.length < MIN_KPIS) return Method.badRequest('kpis_too_short')
  if (kpis.length > MAX_FIELD) return Method.badRequest('kpis_too_long')
  if (notes.length > MAX_NOTES) return Method.badRequest('notes_too_long')

  const user = [
    `業種: ${industry}`,
    '',
    'KPI（前月 / 今月）:',
    '────',
    kpis,
    '────',
    '',
    notes ? `補足:\n${notes}\n` : '',
    '上記の指標を整理して、サマリ・注目すべき変化・来月の打ち手・注意事項 の形で月次レポートを生成してください。',
  ].filter(Boolean).join('\n')

  try {
    const { text, usage } = await complete({
      system: SYSTEM_PROMPT,
      user,
      temperature: 0.5,
      max_tokens: 1800,
    })
    return jsonResponse({ ok: true, text, usage })
  } catch (err) {
    return errorResponse(err)
  }
}
