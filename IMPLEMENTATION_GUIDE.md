# Whitepaper Rewriter - 完全実装ガイド

このドキュメントだけで、GCP + GAS + ブラウザアプリの統合実装が完了します。

---

## 📋 目次

1. [システム概要](#システム概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [実装タスク一覧](#実装タスク一覧)
4. [Task 1: GCP Cloud Runバックエンド実装](#task-1-gcp-cloud-runバックエンド実装)
5. [Task 2: GASコード（完全版）](#task-2-gasコード完全版)
6. [Task 3: ブラウザアプリ - Sheet生成 + GASバインド](#task-3-ブラウザアプリ---sheet生成--gasバインド)
7. [Task 4: GCPセットアップ](#task-4-gcpセットアップ)
8. [Task 5: デプロイとテスト](#task-5-デプロイとテスト)
9. [トラブルシューティング](#トラブルシューティング)

---

## システム概要

### 目的
ブラウザアプリでホワイトペーパーの構成を自動生成し、Googleスプレッドシートに出力。そのシートにバインドされたGASで、AIによる自動リライト機能を提供する。**APIキーはサーバー側で管理し、ユーザーには見せない**。

### 処理フロー
```
[ブラウザアプリ]
  ↓ (1) Sheets APIでスプレッドシート生成
  ↓ (2) Apps Script APIでGASをバインド
[Googleスプレッドシート + GAS]
  ↓ (3) ユーザーがメニューから「Rewrite」実行
[GAS]
  ↓ (4) データをCloud Runに送信
[Cloud Run (GCP)]
  ↓ (5) Secret ManagerからAPIキー取得
  ↓ (6) OpenAI APIを呼び出し
  ↓ (7) 結果をGASに返す
[GAS]
  ↓ (8) スプレッドシートに結果を書き戻し（差分は赤字）
[Googleスプレッドシート]
```

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                   ブラウザアプリ                          │
│              (Next.js/React + GCP接続済み)               │
└────────────┬────────────────────────────────────────────┘
             │
             ├─ (1) Google Sheets API
             │      スプレッドシート作成
             │
             ├─ (2) Apps Script API
             │      GASをバインド
             │
             ↓
┌────────────────────────────────────────────────────────┐
│            Googleスプレッドシート + GAS                  │
│  ┌──────────────────────────────────────────────┐      │
│  │  カスタムメニュー: Whitepaper Rewriter       │      │
│  │  - Rewrite all commented rows (batch: 5)    │      │
│  │  - Show Usage                                │      │
│  │  - View Backlog                              │      │
│  └──────────────────────────────────────────────┘      │
└────────────┬───────────────────────────────────────────┘
             │
             │ (3) ユーザーがリライト実行
             │
             ↓
┌────────────────────────────────────────────────────────┐
│                        GAS                              │
│  - データ収集（コメント付き行）                          │
│  - Cloud Runにリクエスト送信                            │
│  - 結果をスプレッドシートに反映                          │
│  - 差分を赤字でハイライト（LCS）                         │
└────────────┬───────────────────────────────────────────┘
             │
             │ (4) POST /api/rewrite
             │     { batch, headers, userEmail }
             │
             ↓
┌────────────────────────────────────────────────────────┐
│              Cloud Run (GCP)                            │
│  ┌──────────────────────────────────────────────┐      │
│  │  /api/rewrite                                │      │
│  │  - 認証チェック (userEmail)                  │      │
│  │  - 使用量チェック (Firestore)                │      │
│  │  - OpenAI API呼び出し                        │      │
│  │  - 使用量記録                                │      │
│  │  - ログ保存                                  │      │
│  └──────────────────────────────────────────────┘      │
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│  │  /api/usage                                  │      │
│  │  - 使用量確認                                │      │
│  └──────────────────────────────────────────────┘      │
└────────────┬───────────────────────────────────────────┘
             │
             ├─ (5) Secret Manager
             │      OPENAI_API_KEY 取得
             │
             ├─ (6) Firestore
             │      使用量管理・ログ保存
             │
             └─ (7) OpenAI API
                    gpt-5-mini でリライト
```

---

## 実装タスク一覧

### ✅ チェックリスト

- [ ] **Task 1**: GCP Cloud Runバックエンド実装
- [ ] **Task 2**: GASコード作成（完全版）
- [ ] **Task 3**: ブラウザアプリにSheet生成 + GASバインド機能追加
- [ ] **Task 4**: GCPセットアップ（Secret Manager, Firestore, Cloud Run）
- [ ] **Task 5**: デプロイとテスト

---

## Task 1: GCP Cloud Runバックエンド実装

### 📁 プロジェクト構造

```
whitepaper-backend/
├── package.json
├── Dockerfile
├── .dockerignore
├── .env.example
└── src/
    ├── index.js          # メインサーバー
    ├── openai.js         # OpenAI処理
    ├── usage.js          # 使用量管理
    └── schema.js         # JSON Schema生成
```

### 📝 実装コード

#### `package.json`

```json
{
  "name": "whitepaper-backend",
  "version": "1.0.0",
  "description": "Backend API for Whitepaper Rewriter",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "openai": "^4.28.0",
    "@google-cloud/secret-manager": "^5.0.0",
    "@google-cloud/firestore": "^7.1.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

#### `Dockerfile`

```dockerfile
FROM node:18-slim

# 作業ディレクトリ
WORKDIR /app

# 依存関係をコピーしてインストール
COPY package*.json ./
RUN npm ci --only=production

# アプリケーションコードをコピー
COPY . .

# ポート公開
EXPOSE 8080

# 起動コマンド
CMD ["node", "src/index.js"]
```

#### `.dockerignore`

```
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
.DS_Store
```

#### `.env.example`

```bash
PORT=8080
GCP_PROJECT_ID=your-gcp-project-id
FREE_TIER_LIMIT=100
PREMIUM_TIER_LIMIT=10000
```

#### `src/index.js`

```javascript
const express = require('express');
const cors = require('cors');
const { rewriteHandler } = require('./openai');
const { getUsage } = require('./usage');

const app = express();

// ミドルウェア
app.use(cors({
  origin: [
    'https://script.google.com',
    'https://docs.google.com',
    /\.googleusercontent\.com$/
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// ヘルスチェック
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Whitepaper Rewriter API',
    version: '1.0.0'
  });
});

// リライトエンドポイント
app.post('/api/rewrite', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];

    if (!userEmail) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'x-user-email header is required'
      });
    }

    const { batch, headers } = req.body;

    if (!batch || !headers || !Array.isArray(batch) || !Array.isArray(headers)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'batch and headers are required and must be arrays'
      });
    }

    console.log(`[REWRITE] User: ${userEmail}, Batch size: ${batch.length}`);

    const result = await rewriteHandler(userEmail, batch, headers);

    res.json(result);

  } catch (error) {
    console.error('[ERROR]', error);

    // 使用量超過エラー
    if (error.code === 'USAGE_LIMIT_EXCEEDED') {
      return res.status(429).json({
        error: 'Usage limit exceeded',
        usage: error.usage,
        upgrade_url: 'https://your-app.com/upgrade'
      });
    }

    // OpenAI APIエラー
    if (error.code === 'OPENAI_ERROR') {
      return res.status(502).json({
        error: 'OpenAI API Error',
        message: error.message
      });
    }

    // その他のエラー
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// 使用量確認エンドポイント
app.get('/api/usage', async (req, res) => {
  try {
    const userEmail = req.query.email;

    if (!userEmail) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'email query parameter is required'
      });
    }

    const usage = await getUsage(userEmail);
    res.json(usage);

  } catch (error) {
    console.error('[ERROR]', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
});

// サーバー起動
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
```

#### `src/openai.js`

```javascript
const OpenAI = require('openai');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { checkUsage, recordUsage } = require('./usage');
const { createJsonSchema } = require('./schema');

// Secret Managerクライアント
const secretClient = new SecretManagerServiceClient();

// APIキーキャッシュ
let cachedApiKey = null;

/**
 * Secret ManagerからOpenAI APIキーを取得
 */
async function getOpenAIKey() {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const secretName = `projects/${projectId}/secrets/OPENAI_API_KEY/versions/latest`;

  try {
    const [version] = await secretClient.accessSecretVersion({ name: secretName });
    cachedApiKey = version.payload.data.toString('utf8');
    console.log('✅ OpenAI API Key loaded from Secret Manager');
    return cachedApiKey;
  } catch (error) {
    console.error('❌ Failed to load API key from Secret Manager:', error);
    throw new Error('Failed to load OpenAI API key');
  }
}

/**
 * リライト処理のメインハンドラー
 */
async function rewriteHandler(userEmail, batch, headers) {
  // 1. 使用量チェック
  const usage = await checkUsage(userEmail);
  if (usage.remaining <= 0) {
    const error = new Error('Monthly usage limit exceeded');
    error.code = 'USAGE_LIMIT_EXCEEDED';
    error.usage = usage;
    throw error;
  }

  // 2. OpenAI APIキー取得
  const apiKey = await getOpenAIKey();
  const openai = new OpenAI({ apiKey });

  // 3. プロンプト構築
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(batch, headers);

  // 4. JSON Schema生成
  const schema = createJsonSchema(headers);

  // 5. OpenAI API呼び出し
  try {
    const result = await openai.responses.create({
      model: 'gpt-5-mini',
      reasoning: {
        effort: 'low'
      },
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: systemPrompt
          }]
        },
        {
          role: 'user',
          content: [{
            type: 'input_text',
            text: userPrompt
          }]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'whitepaper_rewrite',
          schema: schema,
          strict: true
        }
      }
    });

    // 6. 使用量記録
    await recordUsage(userEmail, {
      batchSize: batch.length,
      tokens: result.usage.total_tokens,
      model: 'gpt-5-mini'
    });

    console.log(`✅ Rewrite completed. Tokens: ${result.usage.total_tokens}`);

    return result;

  } catch (error) {
    console.error('❌ OpenAI API Error:', error);
    const wrappedError = new Error(error.message);
    wrappedError.code = 'OPENAI_ERROR';
    throw wrappedError;
  }
}

/**
 * システムプロンプト構築
 */
function buildSystemPrompt() {
  return `あなたはエンタープライズ向けビジネス文書のリライト専門家です。
スプレッドシートの各行に付けられた「コメント」の指示に従って、積極的に文章を改善してください。

## リライトの原則

### 1. コメントの指示を最優先
- コメントで指示された改善点は、大胆に反映する
- 「もっと○○」という指示は、明確に変化が分かるレベルで対応
- 曖昧な表現は具体的に、冗長な部分は簡潔に

### 2. 品質向上の具体例
- 「初心者にもわかる言葉づかい」→ 専門用語を平易な言葉に置き換え、補足説明を追加
- 「具体例がもっと欲しい」→ 数値例、判断基準、シナリオなどを明示的に追加
- 「簡潔に」→ 冗長な修飾語を削除し、要点を明確化

### 3. 文体の統一
- ビジネス文書として自然で読みやすい文体を維持
- 「です・ます調」で統一
- 箇条書きや構造化を活用して読みやすく

### 4. 変更の範囲
- コメントに関連する列は積極的に改善
- コメントがない列は変更しない
- 全体の整合性を保つ

出力は必ずJSON形式で、rows配列に各行の更新内容を含めてください。`;
}

/**
 * ユーザープロンプト構築
 */
function buildUserPrompt(batch, headers) {
  return `以下のヘッダーとデータ行をリライトしてください。
各行の「コメント」列に記載された指示に従って、該当する列を改善してください。

## ヘッダー（列名）:
${JSON.stringify(headers)}

## データ行（各行のコメント付き）:
${JSON.stringify(batch.map(item => ({
  row_index: item.row_index,
  record: item.record,
  comment: item.comment
})))}

## 出力形式
- コメントの指示に沿って、関連する列を積極的に改善
- 変更が明確に分かるレベルで修正
- コメント列自体は返す必要ありません（返ってきても無視されます）
- 全ての列を必ず返してください（変更しない列も含む）`;
}

module.exports = {
  rewriteHandler
};
```

#### `src/usage.js`

```javascript
const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore();

// フリーティアの制限
const FREE_TIER_LIMIT = parseInt(process.env.FREE_TIER_LIMIT) || 100;
const PREMIUM_TIER_LIMIT = parseInt(process.env.PREMIUM_TIER_LIMIT) || 10000;

/**
 * 使用量をチェック
 */
async function checkUsage(userEmail) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const docRef = db.collection('usage').doc(`${userEmail}_${month}`);

  const doc = await docRef.get();
  const current = doc.exists ? (doc.data().count || 0) : 0;

  // プレミアムステータス確認（将来的にStripe等と連携）
  const isPremium = await checkPremiumStatus(userEmail);
  const limit = isPremium ? PREMIUM_TIER_LIMIT : FREE_TIER_LIMIT;

  return {
    current,
    limit,
    remaining: Math.max(0, limit - current),
    is_premium: isPremium
  };
}

/**
 * 使用量を記録
 */
async function recordUsage(userEmail, metadata) {
  const month = new Date().toISOString().slice(0, 7);
  const docRef = db.collection('usage').doc(`${userEmail}_${month}`);

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    const data = doc.exists ? doc.data() : { count: 0, tokens: 0 };

    transaction.set(docRef, {
      email: userEmail,
      month: month,
      count: data.count + 1,
      tokens: (data.tokens || 0) + (metadata.tokens || 0),
      lastUsed: new Date(),
      updatedAt: new Date()
    }, { merge: true });
  });

  // ログ記録
  await db.collection('logs').add({
    userEmail,
    timestamp: new Date(),
    batchSize: metadata.batchSize,
    tokens: metadata.tokens,
    model: metadata.model
  });

  console.log(`📊 Usage recorded for ${userEmail}: +1 request, +${metadata.tokens} tokens`);
}

/**
 * 使用量を取得
 */
async function getUsage(userEmail) {
  return await checkUsage(userEmail);
}

/**
 * プレミアムステータス確認
 * 将来的にStripe等と連携
 */
async function checkPremiumStatus(userEmail) {
  // TODO: Stripe Subscriptionの確認
  // const userDoc = await db.collection('users').doc(userEmail).get();
  // return userDoc.exists && userDoc.data().isPremium;

  return false; // デフォルトはフリー
}

module.exports = {
  checkUsage,
  recordUsage,
  getUsage
};
```

#### `src/schema.js`

```javascript
/**
 * JSON Schemaを動的生成（ヘッダーベース）
 */
function createJsonSchema(headers) {
  const properties = {
    row_index: { type: 'integer' }
  };

  // 全てのヘッダーをプロパティに追加
  headers.forEach(header => {
    properties[header] = { type: 'string' };
  });

  // strict モードでは全てのプロパティキーを required に含める必要がある
  const requiredFields = ['row_index'].concat(headers);

  return {
    type: 'object',
    required: ['rows'],
    additionalProperties: false,
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          required: requiredFields,
          additionalProperties: false,
          properties: properties
        }
      }
    }
  };
}

module.exports = {
  createJsonSchema
};
```

---

## Task 2: GASコード（完全版）

このコードをGASプロジェクトに配置します。

### 📝 `Code.gs` （完全版）

```javascript
/**
 * Whitepaper Rewriter - Google Apps Script
 * Cloud Run経由でOpenAI APIを呼び出し、セキュアにリライト処理を実行
 */

// ========================================
// 設定: Cloud Run URL
// ========================================

// TODO: Cloud RunデプロイURL後に更新（ブラウザアプリから自動置換される）
const CLOUD_RUN_URL = 'CLOUD_RUN_URL_PLACEHOLDER';

// ========================================
// メニュー登録
// ========================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Whitepaper Rewriter')
    .addItem('Rewrite all commented rows (batch: 5)', 'rewriteCommentedRows')
    .addItem('Show Usage', 'showUsage')
    .addSeparator()
    .addItem('View Backlog', 'viewBacklog')
    .addToUi();

  ensureBacklogSheet();
}

// ========================================
// Backlog管理
// ========================================

function ensureBacklogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let backlog = ss.getSheetByName('Backlog');

  if (!backlog) {
    backlog = ss.insertSheet('Backlog');

    backlog.getRange(1, 1, 1, 6).setValues([[
      'Timestamp',
      'Type',
      'Batch Index',
      'Status',
      'Message',
      'Details'
    ]]);

    backlog.getRange(1, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground('#4285F4')
      .setFontColor('#FFFFFF');

    backlog.setColumnWidth(1, 150);
    backlog.setColumnWidth(2, 100);
    backlog.setColumnWidth(3, 80);
    backlog.setColumnWidth(4, 80);
    backlog.setColumnWidth(5, 300);
    backlog.setColumnWidth(6, 400);
  }

  return backlog;
}

function logToBacklog(type, batchIndex, status, message, details) {
  try {
    const backlog = ensureBacklogSheet();
    const timestamp = new Date();

    backlog.appendRow([
      timestamp,
      type,
      batchIndex || '-',
      status,
      message,
      typeof details === 'object' ? JSON.stringify(details, null, 2) : details
    ]);
  } catch (e) {
    Logger.log('Failed to log to Backlog: ' + e.message);
  }
}

function viewBacklog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backlog = ensureBacklogSheet();

  if (backlog.isSheetHidden()) {
    backlog.showSheet();
  }
  ss.setActiveSheet(backlog);
}

// ========================================
// 使用量表示
// ========================================

function showUsage() {
  const ui = SpreadsheetApp.getUi();
  const userEmail = Session.getActiveUser().getEmail();

  try {
    const response = UrlFetchApp.fetch(
      `${CLOUD_RUN_URL}/api/usage?email=${encodeURIComponent(userEmail)}`
    );
    const usage = JSON.parse(response.getContentText());

    ui.alert(
      'Usage Status',
      `今月の使用量: ${usage.current} / ${usage.limit}\n` +
      `残り: ${usage.remaining} リクエスト\n\n` +
      (usage.is_premium ? '✨ プレミアムプラン' : '🆓 フリープラン'),
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('Error', 'Failed to fetch usage: ' + e.message, ui.ButtonSet.OK);
  }
}

// ========================================
// メイン処理
// ========================================

function rewriteCommentedRows() {
  const ui = SpreadsheetApp.getUi();

  try {
    // 1. 対象シートの特定（VERn の最新 or アクティブシート）
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = getSourceSheet(ss);

    if (!sourceSheet) {
      ui.alert('No valid sheet found.');
      return;
    }

    // 2. データ取得
    const data = sourceSheet.getDataRange().getValues();
    if (data.length < 2) {
      ui.alert('Sheet has no data rows (only header).');
      return;
    }

    const headers = data[0];
    const commentColIndex = headers.length - 1;

    // 3. コメントがある行を収集
    const commentedRows = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const comment = String(row[commentColIndex] || '').trim();

      if (comment) {
        const record = {};
        headers.forEach((h, idx) => {
          record[h] = String(row[idx] || '');
        });

        commentedRows.push({
          row_index: i + 1,
          record: record,
          comment: comment
        });
      }
    }

    if (commentedRows.length === 0) {
      ui.alert('No rows with comments found.');
      return;
    }

    // 4. 新しいVERシートを作成してコピー
    const newVerName = getNextVerName(ss);
    const newSheet = ss.insertSheet(newVerName);

    const sourceRange = sourceSheet.getDataRange();
    const destRange = newSheet.getRange(1, 1, sourceRange.getNumRows(), sourceRange.getNumColumns());
    sourceRange.copyTo(destRange, SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);

    for (let col = 1; col <= headers.length; col++) {
      newSheet.setColumnWidth(col, sourceSheet.getColumnWidth(col));
    }

    logToBacklog('INFO', '-', 'START', `Created new sheet: ${newVerName}`, `Processing ${commentedRows.length} rows`);
    ui.alert(`Created new sheet: ${newVerName}\nProcessing ${commentedRows.length} rows...`);

    // 5. バッチ処理（5行ずつ）
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < commentedRows.length; i += BATCH_SIZE) {
      batches.push(commentedRows.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      try {
        logToBacklog('API_REQUEST', batchIndex + 1, 'SENDING', `Batch ${batchIndex + 1}/${batches.length}`, {
          batch_size: batch.length,
          row_indices: batch.map(b => b.row_index)
        });

        const updates = callCloudRun(batch, headers, batchIndex + 1);

        logToBacklog('API_RESPONSE', batchIndex + 1, 'SUCCESS', `Received ${updates.length} updates`, updates);

        // 6. 更新を反映
        updates.forEach(update => {
          const rowIndex = update.row_index;

          headers.forEach((header, colIndex) => {
            if (colIndex === commentColIndex) return;

            if (header in update && update[header] !== undefined) {
              const oldValue = String(data[rowIndex - 1][colIndex] || '');
              const newValue = String(update[header] || '');

              const richText = createDiffRichText(oldValue, newValue);
              newSheet.getRange(rowIndex, colIndex + 1).setRichTextValue(richText);
            }
          });
        });

        processedCount += batch.length;

      } catch (e) {
        logToBacklog('ERROR', batchIndex + 1, 'FAILED', e.message, e.stack);
        ui.alert(`Error processing batch ${batchIndex + 1}:\n${e.message}`);
      }
    }

    logToBacklog('INFO', '-', 'COMPLETE', `Finished processing`, `Sheet: ${newVerName}, Processed: ${processedCount} rows`);
    ui.alert(`Completed!\nSheet: ${newVerName}\nProcessed: ${processedCount} rows`);

  } catch (e) {
    ui.alert(`Error: ${e.message}`);
  }
}

// ========================================
// Cloud Run呼び出し
// ========================================

function callCloudRun(batch, headers, batchIndex) {
  const userEmail = Session.getActiveUser().getEmail();

  const payload = {
    batch: batch,
    headers: headers
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-User-Email': userEmail
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: 300000
  };

  logToBacklog('API_CALL', batchIndex, 'SENDING', 'Calling Cloud Run API', {
    url: CLOUD_RUN_URL,
    user: userEmail,
    timeout_seconds: 300
  });

  const response = UrlFetchApp.fetch(`${CLOUD_RUN_URL}/api/rewrite`, options);
  const statusCode = response.getResponseCode();

  if (statusCode === 429) {
    const error = JSON.parse(response.getContentText());
    throw new Error(
      `月間使用制限に達しました。\n` +
      `現在: ${error.usage.current}/${error.usage.limit}\n\n` +
      `プレミアムプランへのアップグレード:\n${error.upgrade_url}`
    );
  }

  if (statusCode >= 300) {
    throw new Error(`Cloud Run API Error (${statusCode}):\n${response.getContentText()}`);
  }

  const result = JSON.parse(response.getContentText());

  logToBacklog('RAW_RESPONSE', batchIndex, 'RECEIVED', 'Full API response', result);

  // レスポンスパース
  let rows = [];

  try {
    if (result.output && Array.isArray(result.output)) {
      logToBacklog('PARSE', batchIndex, 'INFO', 'Found output array', {
        output_length: result.output.length,
        output_types: result.output.map(o => o.type)
      });

      const messageOutput = result.output.find(o => o.type === 'message');

      if (messageOutput && messageOutput.content && messageOutput.content[0]) {
        const content = messageOutput.content[0];
        logToBacklog('PARSE', batchIndex, 'INFO', 'Found message content', {
          type: content.type,
          text_preview: content.text ? content.text.substring(0, 200) : null
        });

        if (content.type === 'output_text' && content.text) {
          const parsed = JSON.parse(content.text);
          rows = parsed.rows || [];
        }
      }
    } else if (result.choices && result.choices[0] && result.choices[0].message) {
      const messageContent = result.choices[0].message.content;
      logToBacklog('PARSE', batchIndex, 'INFO', 'Parsing from choices[0].message.content', {
        content_preview: messageContent ? messageContent.substring(0, 200) : null
      });
      const parsed = JSON.parse(messageContent);
      rows = parsed.rows || [];
    } else if (result.rows) {
      logToBacklog('PARSE', batchIndex, 'INFO', 'Using direct result.rows', null);
      rows = result.rows;
    }

    logToBacklog('PARSE', batchIndex, 'SUCCESS', `Parsed ${rows.length} rows`, {
      row_count: rows.length,
      sample_row: rows[0] || null
    });

  } catch (e) {
    logToBacklog('PARSE', batchIndex, 'ERROR', `Parse failed: ${e.message}`, {
      error: e.message,
      stack: e.stack,
      result: result
    });
    throw new Error(`Failed to parse response: ${e.message}`);
  }

  return rows;
}

// ========================================
// ユーティリティ関数
// ========================================

function getSourceSheet(ss) {
  const sheets = ss.getSheets();
  const verSheets = sheets.filter(s => /^VER\d+$/.test(s.getName()));

  if (verSheets.length > 0) {
    verSheets.sort((a, b) => {
      const numA = parseInt(a.getName().replace('VER', ''));
      const numB = parseInt(b.getName().replace('VER', ''));
      return numB - numA;
    });
    return verSheets[0];
  }

  return ss.getActiveSheet();
}

function getNextVerName(ss) {
  const sheets = ss.getSheets();
  const verSheets = sheets.filter(s => /^VER\d+$/.test(s.getName()));

  if (verSheets.length === 0) {
    return 'VER2';
  }

  const maxNum = Math.max(...verSheets.map(s => {
    return parseInt(s.getName().replace('VER', ''));
  }));

  return `VER${maxNum + 1}`;
}

function createDiffRichText(oldText, newText) {
  if (oldText === newText) {
    return SpreadsheetApp.newRichTextValue().setText(newText).build();
  }

  const lcs = longestCommonSubsequence(oldText, newText);
  const richTextBuilder = SpreadsheetApp.newRichTextValue();
  richTextBuilder.setText(newText);

  let oldIdx = 0;
  let newIdx = 0;

  const redStyle = SpreadsheetApp.newTextStyle()
    .setForegroundColor('#FF0000')
    .build();

  for (let i = 0; i < lcs.length; i++) {
    const char = lcs[i];

    while (oldIdx < oldText.length && oldText[oldIdx] !== char) {
      oldIdx++;
    }

    while (newIdx < newText.length && newText[newIdx] !== char) {
      richTextBuilder.setTextStyle(newIdx, newIdx + 1, redStyle);
      newIdx++;
    }

    oldIdx++;
    newIdx++;
  }

  while (newIdx < newText.length) {
    richTextBuilder.setTextStyle(newIdx, newIdx + 1, redStyle);
    newIdx++;
  }

  return richTextBuilder.build();
}

function longestCommonSubsequence(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m;
  let j = n;
  let lcs = '';

  while (i > 0 && j > 0) {
    if (str1[i - 1] === str2[j - 1]) {
      lcs = str1[i - 1] + lcs;
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}
```

### 📝 `appsscript.json`

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

---

## Task 3: ブラウザアプリ - Sheet生成 + GASバインド

ブラウザアプリケーション側に、スプレッドシート生成とGASバインドの機能を追加します。

### 📁 実装場所

既存のブラウザアプリケーション（Next.js/React等）のAPIルート、またはサーバーサイド処理に追加。

### 📝 実装コード

#### `pages/api/create-whitepaper-sheet.ts` (Next.js例)

```typescript
import { google } from 'googleapis';
import type { NextApiRequest, NextApiResponse } from 'next';

// GASコードを読み込む（別ファイルから）
import { GAS_CODE, APPSSCRIPT_JSON } from '@/lib/gas-templates';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, data, cloudRunUrl } = req.body;

    // Google API認証
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/script.projects'
      ]
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const script = google.script({ version: 'v1', auth });

    // 1. スプレッドシート作成
    console.log('Creating spreadsheet...');
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: `Whitepaper: ${title}`
        },
        sheets: [{
          properties: {
            title: 'Sheet1',
            gridProperties: {
              rowCount: 1000,
              columnCount: 20
            }
          },
          data: [{
            rowData: formatDataForSheet(data)
          }]
        }]
      }
    });

    const spreadsheetId = createResponse.data.spreadsheetId;
    console.log(`✅ Spreadsheet created: ${spreadsheetId}`);

    // 2. Apps Scriptプロジェクトを作成してバインド
    console.log('Creating Apps Script project...');
    const scriptProject = await script.projects.create({
      requestBody: {
        title: 'Whitepaper Rewriter',
        parentId: spreadsheetId
      }
    });

    const scriptId = scriptProject.data.scriptId;
    console.log(`✅ Apps Script created: ${scriptId}`);

    // 3. GASコードをアップロード（Cloud Run URLを置換）
    console.log('Uploading GAS code...');
    const gasCodeWithUrl = GAS_CODE.replace(
      'CLOUD_RUN_URL_PLACEHOLDER',
      cloudRunUrl
    );

    await script.projects.updateContent({
      scriptId: scriptId,
      requestBody: {
        files: [
          {
            name: 'Code',
            type: 'SERVER_JS',
            source: gasCodeWithUrl
          },
          {
            name: 'appsscript',
            type: 'JSON',
            source: APPSSCRIPT_JSON
          }
        ]
      }
    });

    console.log('✅ GAS code uploaded');

    // 4. スプレッドシートのURLを返す
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    res.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      scriptId
    });

  } catch (error: any) {
    console.error('Error creating whitepaper sheet:', error);
    res.status(500).json({
      error: 'Failed to create whitepaper sheet',
      message: error.message
    });
  }
}

/**
 * データをGoogleシート形式に変換
 */
function formatDataForSheet(data: any[]): any[] {
  // データ構造に応じて実装
  // 例: [{ No: '1', タイトル: '...', ... }] → シート行データ

  const headers = Object.keys(data[0] || {});

  return [
    // ヘッダー行
    {
      values: headers.map(h => ({
        userEnteredValue: { stringValue: h }
      }))
    },
    // データ行
    ...data.map(row => ({
      values: headers.map(h => ({
        userEnteredValue: { stringValue: String(row[h] || '') }
      }))
    }))
  ];
}
```

#### `lib/gas-templates.ts`

```typescript
// GASコードをテンプレートとして保持
export const GAS_CODE = `
// Code.gsの内容をここに貼り付け（上記Task 2のコード）
// CLOUD_RUN_URL_PLACEHOLDERが置換される
`;

export const APPSSCRIPT_JSON = `{
  "timeZone": "Asia/Tokyo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}`;
```

#### フロントエンドからの呼び出し例

```typescript
// pages/whitepaper-generator.tsx など

async function createWhitepaperSheet() {
  const response = await fetch('/api/create-whitepaper-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'エンタープライズAI自動化',
      data: whitepaperData, // 生成されたホワイトペーパーデータ
      cloudRunUrl: process.env.NEXT_PUBLIC_CLOUD_RUN_URL
    })
  });

  const result = await response.json();

  if (result.success) {
    window.open(result.spreadsheetUrl, '_blank');
  }
}
```

---

## Task 4: GCPセットアップ

### 4-1. Secret Managerにキー保存

```bash
# GCPプロジェクトID設定
export PROJECT_ID=your-gcp-project-id
gcloud config set project $PROJECT_ID

# Secret Manager APIを有効化
gcloud services enable secretmanager.googleapis.com

# OpenAI APIキーをSecretに保存
echo -n "sk-your-openai-api-key-here" | gcloud secrets create OPENAI_API_KEY \
  --data-file=- \
  --replication-policy="automatic"

# 確認
gcloud secrets versions access latest --secret="OPENAI_API_KEY"
```

### 4-2. Firestore有効化

```bash
# Firestore APIを有効化
gcloud services enable firestore.googleapis.com

# Firestoreデータベース作成（Native mode）
gcloud firestore databases create --region=asia-northeast1
```

### 4-3. Cloud Run デプロイ

```bash
# プロジェクトルートで実行
cd whitepaper-backend

# Cloud Run APIを有効化
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# デプロイ（初回）
gcloud run deploy whitepaper-api \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID=$PROJECT_ID,FREE_TIER_LIMIT=100,PREMIUM_TIER_LIMIT=10000 \
  --set-secrets=OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --memory 512Mi \
  --timeout 300

# デプロイURLを取得
gcloud run services describe whitepaper-api \
  --region asia-northeast1 \
  --format='value(status.url)'
```

出力されたURL（例: `https://whitepaper-api-xxxxx-an.a.run.app`）をメモしておく。

### 4-4. サービスアカウントの権限設定

```bash
# Cloud RunのサービスアカウントにSecret Manager読み取り権限を付与
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding OPENAI_API_KEY \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Firestore権限（デフォルトで付与されているはず）
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/datastore.user"
```

### 4-5. ブラウザアプリ用サービスアカウント

Sheet生成とGASバインドのため、サービスアカウントを作成。

```bash
# サービスアカウント作成
gcloud iam service-accounts create whitepaper-app \
  --display-name="Whitepaper App Service Account"

# 権限付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:whitepaper-app@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/drive.file"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:whitepaper-app@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/script.developer"

# キーをダウンロード
gcloud iam service-accounts keys create ~/whitepaper-app-key.json \
  --iam-account=whitepaper-app@${PROJECT_ID}.iam.gserviceaccount.com

# 環境変数に設定（ブラウザアプリ側）
# GOOGLE_SERVICE_ACCOUNT_JSON=<~/whitepaper-app-key.jsonの内容>
```

---

## Task 5: デプロイとテスト

### 5-1. Cloud Runのテスト

```bash
# ヘルスチェック
curl https://whitepaper-api-xxxxx-an.a.run.app/

# 使用量確認テスト
curl "https://whitepaper-api-xxxxx-an.a.run.app/api/usage?email=test@example.com"

# リライトテスト（サンプルデータ）
curl -X POST https://whitepaper-api-xxxxx-an.a.run.app/api/rewrite \
  -H "Content-Type: application/json" \
  -H "X-User-Email: test@example.com" \
  -d '{
    "batch": [{
      "row_index": 2,
      "record": {
        "No": "1",
        "タイトル": "テスト",
        "コメント": "もっと具体的に"
      },
      "comment": "もっと具体的に"
    }],
    "headers": ["No", "タイトル", "コメント"]
  }'
```

### 5-2. ブラウザアプリのデプロイ

```bash
# 環境変数を設定
# .env.local または Vercel/Cloud Run環境変数

GOOGLE_SERVICE_ACCOUNT_JSON=<サービスアカウントJSON>
NEXT_PUBLIC_CLOUD_RUN_URL=https://whitepaper-api-xxxxx-an.a.run.app

# デプロイ（Vercel例）
vercel --prod

# またはCloud Run（Next.js）
gcloud run deploy whitepaper-app \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_SERVICE_ACCOUNT_JSON="..." \
  --set-env-vars NEXT_PUBLIC_CLOUD_RUN_URL="https://whitepaper-api-xxxxx-an.a.run.app"
```

### 5-3. エンドツーエンドテスト

1. **ブラウザアプリでホワイトペーパー生成**
   - ブラウザアプリにアクセス
   - ホワイトペーパーの構成を入力
   - 「スプレッドシート生成」ボタンをクリック

2. **スプレッドシートを確認**
   - 新しいタブで開かれたスプレッドシートを確認
   - データが正しく入力されているか確認

3. **GASメニューを確認**
   - スプレッドシートをリロード（F5）
   - メニューに「Whitepaper Rewriter」が表示されるか確認

4. **リライト実行**
   - 任意の行の最右列（コメント列）に「もっと具体的に」などと入力
   - メニュー「Whitepaper Rewriter > Rewrite all commented rows (batch: 5)」を実行
   - VER2タブが作成され、変更箇所が赤字で表示されるか確認

5. **Backlog確認**
   - メニュー「Whitepaper Rewriter > View Backlog」を開く
   - APIリクエスト、レスポンス、パース結果がログされているか確認

6. **使用量確認**
   - メニュー「Whitepaper Rewriter > Show Usage」を実行
   - 使用量が正しく表示されるか確認

---

## トラブルシューティング

### Cloud Run関連

#### エラー: "Failed to load API key from Secret Manager"

**原因**: Secret Managerへのアクセス権限がない

**解決策**:
```bash
# サービスアカウントに権限付与
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding OPENAI_API_KEY \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

#### エラー: "Firestore connection failed"

**原因**: Firestoreが有効化されていない

**解決策**:
```bash
gcloud services enable firestore.googleapis.com
gcloud firestore databases create --region=asia-northeast1
```

### GAS関連

#### エラー: "Cloud Run API Error (404)"

**原因**: Cloud Run URLが間違っている、またはプレースホルダーのまま

**解決策**:
1. Cloud Run URLを確認:
   ```bash
   gcloud run services describe whitepaper-api \
     --region asia-northeast1 \
     --format='value(status.url)'
   ```
2. GASコードの`CLOUD_RUN_URL`を更新
3. ブラウザアプリのSheet生成処理で、正しいURLを渡しているか確認

#### メニューが表示されない

**原因**: GASが正しくバインドされていない

**解決策**:
1. スプレッドシートで「拡張機能 > Apps Script」を開く
2. `Code.gs`と`appsscript.json`が存在するか確認
3. 存在しない場合は、ブラウザアプリのSheet生成処理を再実行

### Sheets API関連

#### エラー: "The caller does not have permission"

**原因**: サービスアカウントに適切な権限がない

**解決策**:
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:whitepaper-app@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/drive.file"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:whitepaper-app@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/script.developer"
```

### OpenAI API関連

#### エラー: "OpenAI API Error (401): Incorrect API key"

**原因**: Secret Managerに保存されているAPIキーが間違っている

**解決策**:
```bash
# 新しいバージョンを追加
echo -n "sk-correct-api-key" | gcloud secrets versions add OPENAI_API_KEY --data-file=-

# Cloud Runを再デプロイ（新しいバージョンを使用）
gcloud run services update whitepaper-api \
  --region asia-northeast1 \
  --set-secrets=OPENAI_API_KEY=OPENAI_API_KEY:latest
```

#### エラー: "Usage limit exceeded"

**原因**: 月間使用制限に達した

**解決策**:
1. Firestoreで使用量をリセット（テスト用）:
   - Firestore コンソールを開く
   - `usage`コレクションから該当ドキュメントを削除
2. 制限値を増やす:
   ```bash
   gcloud run services update whitepaper-api \
     --region asia-northeast1 \
     --set-env-vars FREE_TIER_LIMIT=1000
   ```

---

## まとめ

このガイドに従って実装すれば、以下が完成します：

✅ **セキュアなAPIキー管理**: Secret Managerで管理、ユーザーには見えない
✅ **使用量管理**: Firestoreで月間使用量を追跡
✅ **自動Sheet生成**: ブラウザアプリからGASバインド済みSheetを作成
✅ **AIリライト機能**: GASからCloud Run経由でOpenAI呼び出し
✅ **差分可視化**: LCSで変更箇所を赤字表示
✅ **ログ記録**: Backlogシートに全ての処理を記録

## 次のステップ（オプション）

- [ ] Stripe連携でプレミアムプラン実装
- [ ] 使用量ダッシュボード作成
- [ ] メール通知（使用量超過時）
- [ ] 複数モデル対応（gpt-4o等）
- [ ] バッチサイズのカスタマイズ機能

---

**注意**:
- `CLOUD_RUN_URL_PLACEHOLDER`は必ずCloud RunデプロイURLに置き換えてください
- サービスアカウントJSONは絶対にGitにコミットしないでください（.gitignoreに追加）
- 本番環境では、適切なCORS設定とレート制限を実装してください
