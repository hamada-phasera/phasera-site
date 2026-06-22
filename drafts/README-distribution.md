# 被リンク用記事の投稿ガイド

このフォルダの記事を note / Qiita / Zenn に投稿し、本文から phasera.jp へリンクすることで「被リンク」を作ります。新規ドメインの評価を上げる最大のレバーです。

> このフォルダ（`/drafts/`）は `.vercelignore` で公開対象外。サイトには出ません。

## 重複コンテンツにしない原則

これらの記事は、本体のケーススタディの**要約・別角度版**で、本文が異なります（コピーではない）。なので重複ペナルティの心配は基本ありません。さらに安全にするなら、各プラットフォームの **canonical（正規URL）設定で本体ページを指定**します。

| プラットフォーム | canonical設定 | おすすめ度 |
| --- | --- | --- |
| **Zenn** | 記事の frontmatter に `canonical: https://phasera.jp/cases/auto-reply/` を書ける | ◎（最も安全・SEOフレンドリー） |
| **Qiita** | 記事設定で「この記事は別の場所にも投稿していますか？」→ 元記事URLを指定 | ◎ |
| **note** | canonical設定なし。本文リンクで誘導するだけ | ○（被リンク目的なら十分） |

## リンクの貼り方（重要）

- 各記事に **phasera.jp への自然なリンクを2本**入れてあります（本文中の「ケーススタディ」と末尾の「サービス紹介」）。これを消さずに投稿してください。
- リンクは `nofollow` が付かない通常リンクで。note/Qiita/Zenn の本文リンクは通常 follow なので、そのままでOK。
- アンカーテキスト（リンクの文字）は「Phasera」「ケーススタディ」「士業向け」など、**キーワードを含む自然な日本語**にしてあります。

## 投稿後にやること

1. 投稿URLを控える
2. Google Search Console は自サイトのみ管理なので、外部記事は **Googleが自然にクロール**するのを待つ（数日〜）
3. 投稿を X などで共有すると、クロールと指名検索が早まる

## 記事一覧

- `note-auto-reply.md` — 士業・中小企業向け（→ /cases/auto-reply/ ・ /for/shigyo/）
- `note-scout-dm.md` — 人材派遣・紹介向け（→ /cases/scout-dm/ ・ /for/jinzai-haken/）

## 横展開

同じ要領で、残りのケースからも記事を作れます（私に頼めば下書きします）：
- `/cases/doc-draft/`（書類下書き）→ /for/zeirishi/ ・ /for/gyoseishoshi/ へ
- `/cases/kpi-report/`（KPIレポート）→ /pricing/ ・ 経営者向け
- `/cases/match/`（マッチング）→ /for/jinzai-haken/ へ
