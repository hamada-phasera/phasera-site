// Edge runtime, POST endpoint for the 書類下書きエージェント demo.
// Input: { docType: string, parties: string, summary: string, extraNotes?: string }
// Output: { ok: true, text: string, usage }
// The text contains 4 bracketed sections: 【書類タイトル】【本文】【署名欄】【要確認事項】

import { complete, jsonResponse, Method, errorResponse } from '../../lib/ai-gateway.mjs'

export const config = { runtime: 'edge' }

const SYSTEM_PROMPT = `あなたは士業（税理士・社労士・行政書士・司法書士）のアシスタントとして、依頼された種別の書類の下書きを生成します。

# 厳守ルール
1. 必ず日本語で、書類として通用するフォーマット（タイトル、本文、署名欄、日付）で書く
2. 出力は以下の形式に厳密に従う:
   【書類タイトル】
   <書類のタイトルを明示>

   【本文】
   <書類本文。日本語の書類作法に従い、必要な前文・本文・末文を含める>

   【署名欄】
   <委任者・受任者・代理人などの署名・住所・日付欄>

   【要確認事項】
   - <最終確認が必要な点を箇条書きで列挙>
   - <法的に空欄を残すべき箇所（金額・日付・印鑑など）の明示>
3. 法的に空欄を残すべき箇所は「【要確認】」または「______」のプレースホルダで明示する
4. 確約や法的助言と取られる表現は避ける（「これで法的に有効」「税務署に通る」などは禁止）
5. 必ず最後に「※ この下書きは AI が生成したものです。法的有効性については士業本人による最終確認が必須です。」を入れる
6. 当事者情報や日付などの入力された情報は本文に反映する。不足している場合は【要確認】で示す`

const MAX_FIELD = 2000

export default async function handler(req) {
  if (req.method !== 'POST') return Method.notAllowed()

  let data
  try {
    data = await req.json()
  } catch {
    return Method.badRequest('invalid_json')
  }

  const docType = String(data.docType || '').trim()
  const parties = String(data.parties || '').trim()
  const summary = String(data.summary || '').trim()
  const extraNotes = String(data.extraNotes || '').trim()

  if (!docType) return Method.badRequest('missing_docType')
  if (parties.length < 10) return Method.badRequest('parties_too_short')
  if (parties.length > 1500) return Method.badRequest('parties_too_long')
  if (summary.length < 10) return Method.badRequest('summary_too_short')
  if (summary.length > MAX_FIELD) return Method.badRequest('summary_too_long')
  if (extraNotes.length > 1000) return Method.badRequest('notes_too_long')

  const user = [
    `書類種別: ${docType}`,
    '',
    '当事者情報:',
    '────',
    parties,
    '────',
    '',
    '依頼の要旨:',
    '────',
    summary,
    '────',
    extraNotes ? `\n追加備考:\n${extraNotes}\n` : '',
    '上記の情報をもとに、書類の下書きをタイトル・本文・署名欄・要確認事項 の形で生成してください。',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { text, usage } = await complete({
      system: SYSTEM_PROMPT,
      user,
      temperature: 0.4,
      max_tokens: 2000,
    })
    return jsonResponse({ ok: true, text, usage })
  } catch (err) {
    return errorResponse(err)
  }
}
