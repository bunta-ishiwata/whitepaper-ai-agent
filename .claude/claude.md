# Claude Code プロジェクト設定

## 🚨 重要: Miyabiエージェント使用ルール

### 絶対に守るべき原則

**Claude Codeは直接実装してはいけません。必ずMiyabiエージェントを使用してください。**

#### ルール1: イシュー作成 + Miyabi並列実行

コード変更が必要な場合は、以下の手順を**必ず**実行してください：

1. **GitHubイシューを作成**
   ```bash
   gh issue create --title "[Type] 説明" --body "詳細な実装方針"
   # イシュー番号をメモ（例: #27, #28）
   ```

2. **Miyabiエージェントで並列実行**
   ```bash
   # 単一イシュー
   npx miyabi agent run codegen -i 27

   # 複数イシューを並列実行（推奨）
   npx miyabi agent run codegen -i 27 -p 2 &
   npx miyabi agent run codegen -i 28 -p 2 &
   wait
   ```

#### ルール2: 直接実装が許可される場合

以下の場合**のみ**、Claude Codeが直接実装できます：

- ✅ Miyabiが技術的な理由で実行できない場合のみ
- ✅ GitHubの認証エラーでMiyabiが動作しない場合

**それ以外は絶対にMiyabiエージェントを使用すること！**

#### ルール3: 必ずイシュー番号を指定

Miyabiは`-i`オプションでイシュー番号指定が必須：

```bash
# ❌ NG: イシュー番号なし
npx miyabi agent run codegen

# ✅ OK: イシュー番号指定
npx miyabi agent run codegen -i 27

# ✅ OK: 複数イシューを並列実行
npx miyabi agent run codegen -i 27 -p 2 &
npx miyabi agent run codegen -i 28 -p 2 &
wait
```

### プロジェクト概要

このプロジェクトは**Whitepaper AI Agent**です。

- **目的**: B2Bマーケティング向けホワイトペーパー企画を自動生成
- **使用技術**:
  - TypeScript + Express.js
  - Google Sheets API + OAuth2
  - OpenAI GPT-5 API
  - Google Cloud Platform (Cloud Run, Cloud Storage, Cloud Vision)
  - Miyabi Framework（自律的開発）

### 開発フロー

1. ユーザーから要望を受ける
2. **必ずGitHubイシューを作成**
3. **Miyabiエージェントで並列実行**（`npm run agents:parallel:exec`）
4. ローカルテスト（`npm run dev`）
5. デプロイ（GCP Cloud Run）

### 主要ファイル

- `src/services/llm.ts` - GPT-5統合
- `src/services/sheets.ts` - Google Sheets操作
- `src/services/auth.ts` - OAuth2認証
- `src/routes/generate.ts` - メインAPI
- `public/test.html` - フロントエンドUI

### テスト

```bash
# ローカル開発サーバー起動
npm run dev

# テストページ
http://localhost:3000/test.html

# ビルド
npm run build

# テスト実行
npm test
```

### デプロイ

```bash
# Cloud Runへデプロイ
gcloud builds submit --config=cloudbuild.yaml .
```

---

**再度確認: Claude Codeは直接実装せず、必ずMiyabiエージェントに仕事をさせること！**
