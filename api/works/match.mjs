import { complete, jsonResponse, Method, errorResponse } from '../../lib/ai-gateway.mjs'

export const config = { runtime: 'edge' }

const SYSTEM_PROMPT = `あなたは人材マッチングのアシスタントです。案件と複数の求職者プロファイルを比較し、それぞれの適合度を 0-100 のスコアで判定します。

# 厳守ルール
1. 出力は必ず以下のフォーマットに従う:
   ## 総合ランキング
   1. 候補X — XX/100
   2. 候補Y — XX/100
   3. 候補Z — XX/100

   ## 候補ごとの評価
   ### 候補X（XX/100）
   - 強み: <案件要件と重なる点>
   - 不一致点: <案件要件と合わない点>
   - 推薦理由: <最終判断者向けの一言>

   ### 候補Y（XX/100）
   ...

   ## 補足
   <データ不足や前提のズレがあれば指摘。なければ「特になし」>
2. スコアは必ず数字根拠を示す（「経理3年必須に対し7年→満点」「年収希望が予算上限を10%超え→減点」など）
3. 推測は「仮説」と明記
4. 「絶対この人」のような断定は避ける（「最終判断は人間に残す」前提）
5. 候補が3人未満の場合は「補足」で指摘
6. 必ず最後に「※ この評価は AI が候補と要件を比較した結果です。最終的な人選は採用担当者の責任で行ってください。」を入れる`

const MAX_FIELD = 4000

export default async function handler(req) {
  if (req.method !== 'POST') return Method.notAllowed()
  let data
  try { data = await req.json() } catch { return Method.badRequest('invalid_json') }

  const role = String(data.role || '').trim()
  const candidates = String(data.candidates || '').trim()

  if (role.length < 20) return Method.badRequest('role_too_short')
  if (role.length > 2000) return Method.badRequest('role_too_long')
  if (candidates.length < 30) return Method.badRequest('candidates_too_short')
  if (candidates.length > MAX_FIELD) return Method.badRequest('candidates_too_long')

  const user = [
    '案件詳細:',
    '────',
    role,
    '────',
    '',
    '求職者プロファイル一覧:',
    '════',
    candidates,
    '════',
    '',
    '上記を比較し、総合ランキング・候補ごとの評価・補足 の形で適合度を判定してください。'
  ].join('\n')

  try {
    const { text, usage } = await complete({ system: SYSTEM_PROMPT, user, temperature: 0.4, max_tokens: 2000 })
    return jsonResponse({ ok: true, text, usage })
  } catch (err) {
    return errorResponse(err)
  }
}
