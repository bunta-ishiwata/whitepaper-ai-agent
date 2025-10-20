# デプロイメントガイド

このドキュメントでは、Whitepaper AI AgentをGoogle Cloud Platform (GCP)にデプロイする手順を説明します。

## 前提条件

- Google Cloud ProjectにCloud Run、Cloud Build、Artifact Registry、Secret Managerの各APIが有効化されていること
- `gcloud` CLIがインストールされ、認証済みであること
- 本番環境用の環境変数が準備されていること

## 必要な環境変数

以下の環境変数をSecret Managerに設定する必要があります:

1. `OPENAI_API_KEY` - OpenAI API キー (GPT-5)
2. `GOOGLE_CLIENT_ID` - Google OAuth2 クライアントID
3. `GOOGLE_CLIENT_SECRET` - Google OAuth2 クライアントシークレット
4. `SESSION_SECRET` - セッション暗号化用のシークレット (32バイト以上のランダム文字列)
5. `GCS_BUCKET_NAME` - Google Cloud Storage バケット名

## デプロイ手順

### 1. Secret Managerにシークレットを作成

以下のコマンドを実行して、各シークレットを作成します:

```bash
# OPENAI_API_KEY
echo -n "your-openai-api-key" | gcloud secrets create OPENAI_API_KEY --data-file=-

# GOOGLE_CLIENT_ID
echo -n "your-google-client-id.apps.googleusercontent.com" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-

# GOOGLE_CLIENT_SECRET
echo -n "your-google-client-secret" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-

# SESSION_SECRET (ランダム生成)
openssl rand -base64 32 | gcloud secrets create SESSION_SECRET --data-file=-

# GCS_BUCKET_NAME
echo -n "your-gcs-bucket-name" | gcloud secrets create GCS_BUCKET_NAME --data-file=-
```

### 2. Google OAuth2 リダイレクトURIの更新

Google Cloud Consoleで、OAuth2クライアントの承認済みリダイレクトURIに以下を追加:

```
https://<your-cloud-run-url>/auth/callback
```

### 3. Cloud Run Service Accountに権限付与

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Secret Managerへのアクセス権限
gcloud secrets add-iam-policy-binding OPENAI_API_KEY \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GOOGLE_CLIENT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GOOGLE_CLIENT_SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding SESSION_SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding GCS_BUCKET_NAME \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 4. Cloud Buildでデプロイ

```bash
# ビルドをトリガー
gcloud builds submit --config=cloudbuild.yaml .
```

### 5. デプロイ後の確認

```bash
# サービスURLを取得
gcloud run services describe whitepaper-agent --region=asia-northeast1 --format='value(status.url)'

# ログを確認
gcloud run services logs read whitepaper-agent --region=asia-northeast1 --limit=50
```

### 6. 動作確認

デプロイされたURLにアクセスして、以下を確認:

1. `/` - テストUIが表示されること
2. `/auth/login` - Google OAuth2認証フローが動作すること
3. `/generate` - ホワイトペーパー生成が正常に動作すること

## トラブルシューティング

### シークレットが見つからないエラー

```bash
# シークレット一覧を確認
gcloud secrets list

# 特定のシークレットの詳細を確認
gcloud secrets describe OPENAI_API_KEY
```

### 権限エラー

```bash
# Service Accountの権限を確認
gcloud projects get-iam-policy $PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

### ビルドエラー

```bash
# ビルドログを確認
gcloud builds list --limit=5
gcloud builds log <BUILD_ID>
```

### デプロイ後のエラー

```bash
# リアルタイムログを確認
gcloud run services logs tail whitepaper-agent --region=asia-northeast1
```

## 環境変数の更新

環境変数を更新する場合:

```bash
# シークレットの新しいバージョンを作成
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-

# Cloud Runサービスを再デプロイ (最新バージョンを使用)
gcloud run services update whitepaper-agent --region=asia-northeast1
```

## ロールバック

以前のバージョンにロールバックする場合:

```bash
# リビジョン一覧を確認
gcloud run revisions list --service=whitepaper-agent --region=asia-northeast1

# 特定のリビジョンにロールバック
gcloud run services update-traffic whitepaper-agent \
    --region=asia-northeast1 \
    --to-revisions=<REVISION_NAME>=100
```

## コスト最適化

- **Auto-scaling**: 最大インスタンス数を調整 (`--max-instances`)
- **Minimum instances**: コールドスタートを避ける場合は `--min-instances=1`
- **CPU allocation**: リクエスト時のみCPU割り当て (デフォルト)
- **Memory**: 必要に応じてメモリを調整 (`--memory`)

## セキュリティベストプラクティス

1. **Service Account**: 専用のService Accountを作成し、最小権限の原則に従う
2. **VPC Connector**: 内部リソースへのアクセスが必要な場合はVPC Connectorを使用
3. **Cloud Armor**: DDoS対策やWAFルールを適用
4. **IAM**: Cloud Runサービスへのアクセス制御を適切に設定
5. **Secrets Rotation**: 定期的にシークレットをローテーション

## 参考リンク

- [Cloud Run ドキュメント](https://cloud.google.com/run/docs)
- [Secret Manager ドキュメント](https://cloud.google.com/secret-manager/docs)
- [Cloud Build ドキュメント](https://cloud.google.com/build/docs)
