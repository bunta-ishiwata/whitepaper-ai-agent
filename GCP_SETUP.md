# GCP Infrastructure Setup Guide

このドキュメントでは、Whitepaper Rewriter Backend APIのGCPインフラをセットアップする手順を説明します。

## 前提条件

- Google Cloud Platform (GCP) アカウント
- `gcloud` CLI がインストール済み
- プロジェクトID: `whitepaper-ai-agent-453610`（既存）

## Phase 3: GCP Infrastructure Setup

### 1. GCP認証とプロジェクト設定

```bash
# GCP認証
gcloud auth login

# プロジェクト設定
export PROJECT_ID=whitepaper-ai-agent-453610
gcloud config set project $PROJECT_ID
```

### 2. 必要なAPIの有効化

```bash
# 必要なAPIを有効化
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  artifactregistry.googleapis.com
```

### 3. Artifact Registry リポジトリ作成

```bash
# Docker イメージ用のリポジトリ作成
gcloud artifacts repositories create whitepaper \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Whitepaper AI Agent Docker images"
```

### 4. Secret Manager: OpenAI API Key保存

```bash
# OpenAI API Keyをシークレットとして保存
echo -n "YOUR_OPENAI_API_KEY" | gcloud secrets create openai-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Cloud RunサービスアカウントにSecret Managerへのアクセス権限を付与
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 5. Firestoreデータベース作成

```bash
# Firestoreデータベースを作成（ネイティブモード）
gcloud firestore databases create \
  --location=asia-northeast1 \
  --type=firestore-native

# インデックス作成（必要に応じて）
# コンソールまたはFirestore CLIで設定
```

### 6. Backend APIのビルドとデプロイ

#### 6.1. Dockerイメージのビルド

```bash
cd backend

# ローカルでビルドテスト
docker build -t whitepaper-backend:test .

# Cloud Buildでビルド＆プッシュ
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD)
```

#### 6.2. Cloud Runへのデプロイ

```bash
# Cloud Runサービスのデプロイ
gcloud run deploy whitepaper-backend \
  --image=asia-northeast1-docker.pkg.dev/$PROJECT_ID/whitepaper/backend:latest \
  --region=asia-northeast1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --timeout=60 \
  --set-env-vars="GCP_PROJECT_ID=$PROJECT_ID,NODE_ENV=production,OPENAI_API_KEY_SECRET=openai-api-key,FIRESTORE_USAGE_COLLECTION=rewriter_usage,FIRESTORE_LOGS_COLLECTION=rewriter_logs,MAX_REQUESTS_PER_DAY=100"

# デプロイ後、URLを取得
export BACKEND_URL=$(gcloud run services describe whitepaper-backend --region=asia-northeast1 --format="value(status.url)")
echo "Backend API URL: $BACKEND_URL"
```

### 7. IAM権限設定

```bash
# Cloud RunサービスアカウントにFirestoreアクセス権限を付与
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"

# Secret Managerアクセス権限（再確認）
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 8. 環境変数の更新（フロントエンド）

デプロイ後、フロントエンド（既存のWhitepaper AI Agent）の`.env`ファイルに以下を追加：

```bash
# Backend API URL（Cloud RunのURL）
BACKEND_API_URL=https://whitepaper-backend-XXXXXXXXXX-an.a.run.app
```

## Phase 4: Testing & Deployment Verification

### 1. Health Check

```bash
# Backend APIのヘルスチェック
curl $BACKEND_URL/health

# 期待されるレスポンス:
# {
#   "status": "healthy",
#   "timestamp": "2025-10-19T...",
#   "service": "whitepaper-backend",
#   "version": "1.0.0"
# }
```

### 2. API テスト

#### 2.1. Rewrite API テスト

```bash
# セルの書き換えテスト
curl -X POST $BACKEND_URL/api/rewrite \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test@example.com",
    "original": "この製品は業務効率化を実現します。",
    "instruction": "もっと具体的な数値を入れて書き換えてください",
    "context": {
      "columnName": "価値提案",
      "rowIndex": 0,
      "allHeaders": ["No", "タイトル", "目的", "ターゲット", "価値提案"]
    }
  }'
```

#### 2.2. Schema Generation API テスト

```bash
# JSON Schema生成テスト
curl -X POST $BACKEND_URL/api/schema/generate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test@example.com",
    "headers": ["No", "タイトル", "目的", "ターゲット", "構成"]
  }'
```

#### 2.3. Usage API テスト

```bash
# 使用状況確認
curl "$BACKEND_URL/api/rewrite/usage?userId=test@example.com"
```

### 3. End-to-End テスト

#### 3.1. Whitepaper生成＋GASバインド

既存のWhitepaper AI Agentから、以下の手順でE2Eテスト：

1. ローカル開発サーバーを起動
   ```bash
   cd /path/to/whitepaper-ai-agent
   npm run dev
   ```

2. ブラウザで `http://localhost:3000/test.html` を開く

3. OAuth認証を実行（`/auth/login`）

4. Whitepaper企画を生成
   - フォームに必要事項を入力
   - 「生成」ボタンをクリック
   - スプレッドシートURLが表示されることを確認

5. 生成されたスプレッドシートを開く
   - メニューに「ホワイトペーパー編集」が表示されることを確認
   - セルを選択して「📝 セルを書き換える」を実行
   - AI書き換えが正常に動作することを確認
   - 「📊 バックログを表示」で変更履歴が表示されることを確認
   - 「ℹ️ 使用状況を確認」で今日の使用状況が表示されることを確認

### 4. Firestoreデータ確認

```bash
# Firestoreコンソールで確認
echo "https://console.cloud.google.com/firestore/databases/-default-/data?project=$PROJECT_ID"

# 確認すべきコレクション:
# - rewriter_usage: 日次使用量
# - rewriter_logs: 個別リクエストログ
```

### 5. ログ確認

```bash
# Cloud Runログを確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=whitepaper-backend" \
  --limit=50 \
  --format=json

# エラーログのフィルタリング
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=whitepaper-backend AND severity>=ERROR" \
  --limit=20 \
  --format=json
```

## トラブルシューティング

### Secret Managerアクセスエラー

```bash
# エラー: "Failed to get OpenAI API key from Secret Manager"
# 解決策: IAM権限を再確認

gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Firestoreアクセスエラー

```bash
# エラー: "PERMISSION_DENIED: Missing or insufficient permissions"
# 解決策: Firestore権限を付与

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### CORS エラー

GASからのリクエストがCORSエラーになる場合：

1. `backend/src/index.ts` のCORS設定を確認
2. `https://script.google.com` がoriginに含まれていることを確認
3. Cloud Runを再デプロイ

```bash
cd backend
gcloud builds submit --config=cloudbuild.yaml
```

## コスト見積もり

### Cloud Run

- **無料枠**: 月2百万リクエスト、360,000 vCPU秒、180,000 GiB秒
- **予想コスト**: 小規模利用の場合、ほぼ無料枠内

### Secret Manager

- **無料枠**: 月6回のアクセス
- **予想コスト**: $0.06/月（10,000アクセス = $0.03）

### Firestore

- **無料枠**:
  - 1 GB保存
  - 50,000読み込み/日
  - 20,000書き込み/日
- **予想コスト**: 無料枠内（小規模利用）

### 合計見積もり

月間1,000リクエストの場合: **$0.10以下**

## まとめ

以上でGCPインフラのセットアップが完了します。

**重要な環境変数**:
- `BACKEND_API_URL`: フロントエンド（既存アプリ）の`.env`に追加
- 既存のスプレッドシート生成時に、GASコード内のプレースホルダーが自動置換される

**次のステップ**:
1. 既存アプリを再デプロイ（`BACKEND_API_URL`を含む）
2. E2Eテストを実行
3. 本番環境でのモニタリング設定（Cloud Logging, Cloud Monitoring）
