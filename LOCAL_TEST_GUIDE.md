# ローカルテスト環境セットアップガイド

## 前提条件

以下が必要です：

1. **Google Cloud Platform**
   - プロジェクトID
   - サービスアカウントキー (JSON)
   - OAuth2クライアントID・シークレット

2. **OpenAI API**
   - APIキー

3. **GitHub**
   - Personal Access Token（Miyabiエージェント用）

## 手順

### 1. 環境変数設定

#### メインアプリ（ホワイトペーパーエージェント）

\`\`.env\`\` ファイルを作成：

\`\`\`bash
cp .env.example .env
\`\`\`

以下を設定：

\`\`\`env
# OpenAI Configuration
OPENAI_API_KEY=sk-xxxxxxxxxx
OPENAI_MODEL=gpt-4-turbo-preview

# Google Cloud Platform
GCP_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./path/to/service-account-key.json
GCS_BUCKET_NAME=your-bucket-name

# Google OAuth2
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Session Secret
SESSION_SECRET=$(openssl rand -base64 32)

# Server
PORT=3000
NODE_ENV=development
\`\`\`

#### Backend API（リライト機能）

\`\`backend/.env\`\` ファイルを作成：

\`\`\`bash
cp backend/.env.example backend/.env
\`\`\`

以下を設定：

\`\`\`env
# GCP Project ID
GCP_PROJECT_ID=your-project-id

# Port
PORT=8080

# Environment
NODE_ENV=development

# OpenAI API Key Secret Name（ローカルでは直接設定）
OPENAI_API_KEY=sk-xxxxxxxxxx

# Firestore Collection Names
FIRESTORE_USAGE_COLLECTION=rewriter_usage
FIRESTORE_LOGS_COLLECTION=rewriter_logs

# Rate Limiting
MAX_REQUESTS_PER_DAY=100
\`\`\`

### 2. Firestore設定（オプション）

使用量管理を有効にする場合、Firestoreを有効化：

\`\`\`bash
# GCP Console で Firestore を有効化
# または gcloud CLI で
gcloud firestore databases create --region=asia-northeast1
\`\`\`

**注**: ローカルテストではFirestoreをスキップ可能（エラーは出るが動作する）

### 3. Backend起動

\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`

**確認**: \`http://localhost:8080/health\` にアクセスして健全性確認

### 4. メインアプリ起動

\`\`\`bash
# プロジェクトルートで
npm install
npm run dev
\`\`\`

**確認**: \`http://localhost:3000\` にアクセス

### 5. テストフロー

1. **OAuth認証**
   - \`http://localhost:3000/auth\` にアクセス
   - Googleアカウントでログイン

2. **ホワイトペーパー生成**
   - \`http://localhost:3000/test.html\` でテストページを開く
   - または \`http://localhost:3000/\` でメインUIを使用
   - PDFまたはテキストを入力
   - 「Generate」をクリック

3. **スプレッドシート確認**
   - 生成されたスプレッドシートをGoogleドライブで開く
   - メニュー「Whitepaper Rewriter」が表示されることを確認

4. **リライト機能テスト**
   - 最右列（コメント列）に「もっと具体的に」などと入力
   - メニュー「Whitepaper Rewriter > Rewrite all commented rows (batch: 5)」を実行
   - VER2シートが作成され、変更箇所が赤字表示されることを確認

5. **使用量確認**
   - メニュー「Whitepaper Rewriter > Show Usage」で使用統計を確認

6. **ログ確認**
   - メニュー「Whitepaper Rewriter > View Backlog」で処理履歴を確認

## トラブルシューティング

### Backend API接続エラー

GASから「Backend API error」が出る場合：

1. Backend APIが起動しているか確認（\`http://localhost:8080/health\`）
2. \`.env\` の \`BACKEND_API_URL=http://localhost:8080\` が設定されているか確認
3. GASコード内の\`BACKEND_API_URL\`が正しく置換されているか確認

### Firestore エラー

「Firestore service not initialized」エラーが出る場合：

- ローカルテストでは無視してOK（使用量管理がスキップされる）
- または、Firestoreを有効化して正しいプロジェクトIDを設定

### OAuth エラー

「redirect_uri_mismatch」エラーが出る場合：

1. GCP Console > APIs & Services > Credentials
2. OAuth2クライアントの「承認済みのリダイレクトURI」に \`http://localhost:3000/auth/callback\` を追加

### Apps Script バインドエラー

「Failed to bind Apps Script」警告が出る場合：

- Apps Script APIがプロジェクトで有効化されているか確認
- サービスアカウントに必要な権限があるか確認（\`Script Editor\` role）

## 環境変数チートシート

| 変数名 | 場所 | 必須 | 説明 |
|--------|------|------|------|
| OPENAI_API_KEY | メイン & Backend | ✅ | OpenAI APIキー |
| GCP_PROJECT_ID | メイン & Backend | ✅ | GCPプロジェクトID |
| GOOGLE_APPLICATION_CREDENTIALS | メイン | ✅ | サービスアカウントキーのパス |
| GOOGLE_CLIENT_ID | メイン | ✅ | OAuth2クライアントID |
| GOOGLE_CLIENT_SECRET | メイン | ✅ | OAuth2シークレット |
| SESSION_SECRET | メイン | ✅ | セッション暗号化キー |
| BACKEND_API_URL | メイン | - | Backendの URL（デフォルト: http://localhost:8080） |
| MAX_REQUESTS_PER_DAY | Backend | - | 1日の最大リクエスト数（デフォルト: 100） |

## 次のステップ

ローカルテストが成功したら：

1. コードをコミット
2. Cloud Runにデプロイ
3. 本番環境でテスト

デプロイ手順は \`DEPLOYMENT.md\` を参照してください。
