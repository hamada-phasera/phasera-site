// Edge runtime, POST endpoint for the 求職者スカウトDM生成エージェント demo.
// Input: { role: string, roleDetail: string, candidate: string }
// Output: { ok: true, text: string, usage } — text contains 3 sections (短い版/標準版/詳しい版)

import { complete, jsonResponse, Method, errorResponse } from '../../lib/ai-gateway.mjs'

export const config = { runtime: 'edge' }

const SYSTEM_PROMPT = `あなたは人材派遣・人材紹介のエージェントです。案件と求職者プロファイルから「重なる点」を見つけ、刺さるスカウトDMを3パターン生成します。

# 厳守ルール
1. 必ず日本語で、求職者の状況を尊重した語り口で書く（押し売り厳禁）
2. 出力フォーマットは以下に厳密に従う:
   【短い版 (件名 + 本文 60-80字)】
   件名: <件名>
   本文: <60-80字>

   【標準版 (件名 + 本文 150-200字)】
   件名: <件名>
   本文: <150-200字>

   【詳しい版 (件名 + 本文 300-400字)】
   件名: <件名>
   本文: <300-400字>
3. 案件と求職者プロファイルから具体的な「重なる点」（経験年数、技術スタック、業界、希望条件など）を必ず本文中で言及する
4. 「あなたにぴったり」のような根拠なしの断定は避ける
5. 確約はしない（「内定確約」「年収必ず◯万」などは禁止）
6. 必ず最後に「※ これは AI が生成したスカウト文面です。送信前にご確認ください。」を入れる`

const MAX_FIELD = 2000
const MIN_FIELD = 20

export default async function handler(req) {
  if (req.method !== 'POST') return Method.notAllowed()

  let data
  try {
    data = await req.json()
  } catch {
    return Method.badRequest('invalid_json')
  }

  const role = String(data.role || '').trim()
  const roleDetail = String(data.roleDetail || '').trim()
  const candidate = String(data.candidate || '').trim()

  if (!role) return Method.badRequest('missing_role')
  if (role.length > 100) return Method.badRequest('role_too_long')
  if (!roleDetail || roleDetail.length < MIN_FIELD) return Method.badRequest('role_detail_too_short')
  if (roleDetail.length > MAX_FIELD) return Method.badRequest('role_detail_too_long')
  if (!candidate || candidate.length < MIN_FIELD) return Method.badRequest('candidate_too_short')
  if (candidate.length > MAX_FIELD) return Method.badRequest('candidate_too_long')

  const user = [
    `案件タイトル: ${role}`,
    '',
    '案件サマリ:',
    '────',
    roleDetail,
    '────',
    '',
    '求職者プロファイル:',
    '────',
    candidate,
    '────',
    '',
    '上記の案件と求職者プロファイルから、重なる点を抽出し、短い・標準・詳しい の3パターンのスカウトDMを生成してください。',
  ].join('\n')

  try {
    const { text, usage } = await complete({
      system: SYSTEM_PROMPT,
      user,
      temperature: 0.7,
      max_tokens: 1600,
    })
    return jsonResponse({ ok: true, text, usage })
  } catch (err) {
    return errorResponse(err)
  }
}
