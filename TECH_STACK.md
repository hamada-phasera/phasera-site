# Phasera プロダクト技術スタック — Onice / Relay

Phasera が開発する 2 つのプロダクトの技術スタックまとめ。

> 各プロダクトのソースはこのサイトリポジトリには含まれません（`works/` は別管理）。本書はスタックの俯瞰用です。ファイルパスはリポジトリ外を含む参照表記です。

| | **Onice** | **Relay** |
|---|---|---|
| 一言で | 非エンジニアが Agent Teams を扱う「投影の媒質」 | 並行作業の文脈スイッチコストをゼロにする指揮盤 |
| 形態 | Web アプリ（無限キャンバス） | macOS メニューバー常駐アプリ |
| 言語 | TypeScript | JavaScript (ESM) + Swift |
| ランタイム | Next.js / ブラウザ | Electron / Node.js |
| AI 接続 | Anthropic SDK 直 | Vercel AI Gateway / Anthropic API |
| 永続化 | IndexedDB (Dexie) | SQLite (better-sqlite3) |
| デプロイ | Vercel | ローカル配布（macOS .app） |

---

## Onice — 無限キャンバス型 AI 指揮ツール

> Figma のような無限キャンバスに「ピン = プロンプト = エージェント」を配置し、コードを書かない人が AI エージェントチームを通じて構想を世界に投影する Web 体験。

### コア技術スタック

| 領域 | 技術 | バージョン | 役割 |
|---|---|---|---|
| フレームワーク | **Next.js** (App Router) | 16.2.6 | SSR / API Routes / ルーティング |
| UI ライブラリ | **React** | 19.2.4 | コンポーネント |
| 言語 | **TypeScript** | 5.x | 型安全 |
| キャンバス | **@xyflow/react** (React Flow) | 12.x | 無限キャンバス・ノード・エッジ（ピン配置と接続） |
| 状態管理 | **Zustand** | 5.x | キャンバス状態のクライアントストア |
| 永続化 | **Dexie** (IndexedDB) | 4.x | ブラウザ内にキャンバスを保存 |
| スタイリング | **Tailwind CSS** | 4.x | デザインシステム（PostCSS 経由） |
| AI | **@anthropic-ai/sdk** | 0.98.x | Claude へのリクエスト |
| エクスポート | **JSZip** | 3.x | キャンバスを Next.js プロジェクトとして ZIP 出力 |
| Lint | **ESLint** (eslint-config-next) | 9.x | 静的解析 |
| デプロイ | **Vercel** | — | 本番ホスティング（`phasera-onice-prototype`） |

### AI のモデル割り当て（ロール別）

API ルート `app/api/generate/route.ts` でロールごとにモデルを出し分け（サーバ側 `runtime = "nodejs"`、API キーは `ANTHROPIC_API_KEY`）。

| ロール | モデル | 用途 |
|---|---|---|
| **Designer-AI** | `claude-haiku-4-5` | 高速・低コストの生成 |
| **Client-AI** | `claude-sonnet-4-6` | 高品質な生成 |

### アーキテクチャ要点

- **App Router 構成** — `app/canvas/` がメイン画面、`app/api/generate/` がサーバサイド AI プロキシ（API キーをクライアントに晒さない）。
- **キャンバス層** — `components/canvas/CanvasFlow.tsx` / `PinNode.tsx` が React Flow 上の「ピン」を実装。
- **永続化層** — `lib/db/canvas-store.ts` が Dexie(IndexedDB) + Zustand を結合し、ノード/エッジをブラウザ内に保存。
- **エクスポート層** — `lib/export/to-nextjs.ts` がキャンバスを動く Next.js プロジェクト ZIP に変換。

---

## Relay — macOS 常駐の自律作業オーケストレータ

> メニューバー常駐アプリ。ウィンドウにノードを1本つなぐと AI ワーカーが裏で並行作業を完遂し、**不可逆な一手（提出・送信）だけ**を人間に渡す。設計の核は「常駐シェルに知能を置かない」3層ファイアウォール。

### コア技術スタック

| 領域 | 技術 | バージョン | 役割 |
|---|---|---|---|
| デスクトップ基盤 | **Electron** | 33.x | メニューバー常駐・ウィンドウ・Tray |
| ランタイム | **Node.js** (ESM / `.mjs`) | — | 常駐シェル / オーケストレータ |
| UI ライブラリ | **React** | 18.3.x | ドック / ダッシュボード / オーバーレイ |
| レンダラビルド | **esbuild** | 0.24.x | renderer (JSX) をバンドル |
| 永続化 | **better-sqlite3** | 11.8.x | ジョブ・文脈・スキルの保存（Electron ABI で再ビルド） |
| ネイティブ観測 | **Swift** (AXUIElement / CGWindowList) | — | ウィンドウ本文を**トークン0**で抽出する Sense ヘルパ |
| AI 接続 | **Vercel AI Gateway** / **Anthropic API** | — | 鍵の種別で接続先を自動判別（`sk-ant…`→Anthropic直 / それ以外→Gateway） |
| ツール連携 | **@modelcontextprotocol/sdk** (MCP) | 1.29.x | 既存 Cursor / Claude Desktop の MCP ツールを tool-use に変換 |
| ネイティブ再ビルド | **@electron/rebuild** | 3.7.x | better-sqlite3 を Electron ABI に合わせる |

### AI のモデルカスケード（コスト最小化）

接続は `src/cognition/gateway.mjs`、モデル ID は `src/cognition/models.mjs` に集約。安い順に段階的に上げる。

| 段 | モデル | USD / 1M tok (in/out) |
|---|---|---|
| 軽量 | `claude-haiku-4-5` | 1.0 / 5.0 |
| 標準 | `claude-sonnet-4-6` | 3.0 / 15.0 |
| 高精度 | `claude-opus-4-8` | 5.0 / 25.0 |

`RELAY_MODEL_OVERRIDE` で全段を1モデルに固定可能（AI Gateway 無料枠は Haiku のみのため）。日次/ジョブ別のコスト上限（予算ブレーキ）あり。

### アーキテクチャ要点（3層 + 構造的 AI ファイアウォール）

- **L-A 常駐シェル** (`src/main`) — Tray / ドック / SQLite / リスク仕分け / ブレーキ。**AI を一切 import しない**。
- **L-B オーケストレータ** (`src/main/orchestrator.mjs`) — 実行ループの状態機械。L-C を関数として呼ぶだけ（構造的ファイアウォール）。
- **L-C 思考** (`src/cognition`) — **唯一トークンを消費する層**。goal / infer / act / router ノードで構成（目標駆動の自律委譲へ移行済み）。
- **構造で原則を担保** — `npm run verify:no-ai` が grep で「`src/cognition/` 以外は AI を import しない」を機械的に強制。
- **リスクはルールで固定** — `src/shared/risk.mjs` のパターンマッチで Low/Med/High を判定（**LLM に判定させない**）。不可逆（送信・提出・購入・削除・SQL/MCP 書込）は High = 人間承認ゲート（聖域）。可逆は自動実行。
- **Sense / Act 分離** — Swift ネイティブヘルパ `src/native/relay-sense.swift` が `list`/`at`/`text`/`tree`/`act` を提供。観測は読むだけ（トークン0、Vision 不要）。

---

## スタック比較サマリ

| 観点 | Onice | Relay |
|---|---|---|
| ターゲット | 非エンジニア（俯瞰して指揮） | 並行作業者（裏で自走・最終手だけ人間） |
| プラットフォーム | Web（クロスプラットフォーム） | macOS ネイティブ常駐 |
| 描画 | React Flow 無限キャンバス | Electron + React オーバーレイ + Swift AX |
| AI ホスト | Anthropic SDK（サーバ API ルート） | Vercel AI Gateway / Anthropic 直 |
| モデル戦略 | ロール別固定（Haiku / Sonnet） | コストカスケード（Haiku→Sonnet→Opus）+ 予算ブレーキ |
| データ | IndexedDB（クライアント） | SQLite（ローカル） |
| 設計思想 | 構想の投影・可視化 | 知能の隔離・人間ゲート（聖域） |
| 共通点 | Anthropic Claude / TypeScript・JS / React / Vercel エコシステム | 同左 |
