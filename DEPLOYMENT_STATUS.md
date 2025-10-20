# デプロイメント状況レポート

## 実行日時
2025年10月17日

## プロジェクト情報
- **GCP Project ID**: `whitepaper-ai-koujitsu`
- **Project Number**: `669386852031`
- **Region**: `asia-northeast1`

## 完了した作業

### 1. GCP環境セットアップ ✅
- Cloud Run API有効化
- Cloud Build API有効化
- Artifact Registry API有効化
- Secret Manager API有効化
- その他必要なAPI (Drive, Sheets, Apps Script, Vision, Storage) 有効化

### 2. Artifact Registry ✅
- Docker リポジトリ作成: `asia-northeast1-docker.pkg.dev/whitepaper-ai-koujitsu/whitepaper-agent`
- リポジトリ形式: Docker
- ロケーション: asia-northeast1

### 3. Secret Manager ✅
以下のシークレットを作成し、Cloud Run compute service accountにアクセス権限を付与:
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `GCS_BUCKET_NAME`

### 4. IAM権限設定 ✅
Cloud Build service account (`669386852031@cloudbuild.gserviceaccount.com`) に以下の権限を付与:
- `roles/storage.admin` - Cloud Storage へのアクセス
- `roles/run.admin` - Cloud Run サービスのデプロイ
- `roles/artifactregistry.writer` - Artifact Registry への Docker image push
- `roles/iam.serviceAccountUser` - Compute service account としての実行

Cloud Run compute service account (`669386852031-compute@developer.gserviceaccount.com`) に以下の権限を付与:
- `roles/secretmanager.secretAccessor` - 各シークレットへのアクセス (5件)
- `roles/logging.logWriter` - Cloud Logging への書き込み
- `roles/storage.objectViewer` - Cloud Build bucket へのアクセス

### 5. ビルドスクリプト修正 ✅
- **問題**: ES modules環境で`require()`が使えない
- **解決**: `scripts/copy-gas-files.js` を `scripts/copy-gas-files.cjs` にリネーム
- **結果**: ローカルビルド成功

### 6. Dockerfile更新 ✅
- Node.js 20 slim イメージ使用
- dist/ と public/ ディレクトリをコピー
- PORT=8080, NODE_ENV=production を設定

### 7. cloudbuild.yaml更新 ✅
- 5ステップのビルドプロセス定義
  1. npm install
  2. npm run build (TypeScript コンパイル + GAS ファイルコピー)
  3. Docker image build
  4. Docker image push to Artifact Registry
  5. Cloud Run deploy
- `$BUILD_ID` を使用してイメージタグ付け
- Secret Manager からの環境変数注入設定

### 8. .gcloudignore更新 ✅
- 不要なファイルを除外 (node_modules, dist, test files, etc.)
- src/gas/ ディレクトリは含める (GAS files必要)
- scripts/ ディレクトリは含める (build script必要)

### 9. デプロイスクリプト作成 ✅
- `scripts/deploy.sh`: 自動デプロイスクリプト
  - .envファイルからシークレット読み込み
  - Secret Manager にシークレット作成/更新
  - IAM権限自動設定
  - Cloud Build トリガー

## 未完了/進行中の作業

### Docker Push エラー (進行中) ⚠️
- **状況**: Docker image のビルドは成功するが、Artifact Registry への push が失敗
- **エラー**: `build step 3 "gcr.io/cloud-builders/docker" failed: step exited with non-zero status: 1`
- **原因候補**:
  1. Artifact Registry への認証問題
  2. ネットワーク設定
  3. リポジトリ権限の伝播待ち (IAM 権限変更直後の可能性)

- **Next Steps**:
  1. IAM権限の伝播を待つ (数分待ってから再試行)
  2. Cloud Build logs を詳細に確認
  3. Docker push コマンドを手動で試す
  4. Artifact Registry の認証設定を確認

## デプロイメントコマンド

### 手動デプロイ
```bash
# 方法1: 自動デプロイスクリプト使用
./scripts/deploy.sh

# 方法2: Cloud Build 直接実行
gcloud builds submit --config=cloudbuild.yaml .
```

### トラブルシューティング

#### Docker push エラーの場合
```bash
# 1. IAM権限が正しく設定されているか確認
gcloud projects get-iam-policy whitepaper-ai-koujitsu \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:669386852031@cloudbuild.gserviceaccount.com"

# 2. Artifact Registry への認証設定
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# 3. 手動でDocker imageをビルドしてpush
npm run build
docker build -t asia-northeast1-docker.pkg.dev/whitepaper-ai-koujitsu/whitepaper-agent/whitepaper-agent:test .
docker push asia-northeast1-docker.pkg.dev/whitepaper-ai-koujitsu/whitepaper-agent/whitepaper-agent:test

# 4. Cloud Build ログ確認
gcloud builds list --limit=5
gcloud builds log <BUILD_ID>
```

#### Secret Manager エラーの場合
```bash
# シークレット一覧確認
gcloud secrets list

# 特定のシークレットの詳細確認
gcloud secrets describe OPENAI_API_KEY

# シークレットの値を更新
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

## アーキテクチャ概要

```
[User]
  ↓ HTTP Request
[Cloud Run: whitepaper-agent]
  ├─ Environment Variables: NODE_ENV, PORT, GCP_PROJECT_ID
  ├─ Secrets: OPENAI_API_KEY, GOOGLE_CLIENT_ID, etc.
  ├─ OAuth2 Authentication
  │   └─ Google Drive/Sheets/Apps Script APIs
  ├─ OpenAI GPT-5 API
  ├─ Cloud Storage (PDF upload/processing)
  ├─ Cloud Vision API (PDF parsing)
  └─ Google Apps Script (Bound script attachment)

[Artifact Registry]
  └─ asia-northeast1-docker.pkg.dev/whitepaper-ai-koujitsu/whitepaper-agent
      └─ Docker Images

[Secret Manager]
  ├─ OPENAI_API_KEY
  ├─ GOOGLE_CLIENT_ID
  ├─ GOOGLE_CLIENT_SECRET
  ├─ SESSION_SECRET
  └─ GCS_BUCKET_NAME

[Cloud Build]
  └─ Automated CI/CD Pipeline
      ├─ Build from source
      ├─ Create Docker image
      ├─ Push to Artifact Registry
      └─ Deploy to Cloud Run
```

## セキュリティ設定

- ✅ Secret Manager でシークレット管理
- ✅ IAM 最小権限の原則適用
- ✅ OAuth2 による Google APIs 認証
- ✅ Cloud Run でのHTTPS強制
- ✅ Allow unauthenticated (パブリックアクセス許可)

## リソース設定

- **CPU**: 1 vCPU
- **Memory**: 1 GB
- **Max Instances**: 10
- **Timeout**: 300 seconds
- **Cold start**: ~5-10 seconds

## コスト見積もり (月次)

- Cloud Run: 100万リクエスト/月 → 約$2-5
- Artifact Registry: ストレージ 1GB → 約$0.10
- Secret Manager: 5シークレット → 約$0.30
- Cloud Build: 120分/月 → 無料枠内
- **合計**: 約$3-6/月 (低トラフィック想定)

## 次のステップ

1. **Docker push エラー解決** (最優先)
   - IAM権限の伝播待ち
   - 詳細ログ確認
   - 手動push テスト

2. **デプロイ完了後の作業**
   - Google OAuth2 リダイレクトURI更新
   - 本番環境での動作確認
   - ログモニタリング設定

3. **追加の最適化**
   - Cloud Armor 設定 (DDoS保護)
   - Cloud Monitoring アラート設定
   - 自動スケーリング設定調整

## 参考リンク

- [DEPLOYMENT.md](./DEPLOYMENT.md) - 詳細なデプロイメント手順
- [Cloud Build Console](https://console.cloud.google.com/cloud-build/builds?project=whitepaper-ai-koujitsu)
- [Cloud Run Console](https://console.cloud.google.com/run?project=whitepaper-ai-koujitsu)
- [Artifact Registry Console](https://console.cloud.google.com/artifacts?project=whitepaper-ai-koujitsu)
- [Secret Manager Console](https://console.cloud.google.com/security/secret-manager?project=whitepaper-ai-koujitsu)
