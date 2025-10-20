#!/bin/bash
# GCPプロジェクト自動セットアップスクリプト（非対話式）

set -e

PROJECT_ID="whitepaper-ai-koujitsu"

echo "🚀 GCPプロジェクトセットアップを開始します"
echo ""
echo "プロジェクトID: $PROJECT_ID"
echo ""

# カラー定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 認証確認
echo -e "${BLUE}ステップ 1/8: 認証状態確認${NC}"
if gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
  CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
  echo -e "${GREEN}✓ 認証済み: ${CURRENT_ACCOUNT}${NC}"
else
  echo -e "${YELLOW}認証が必要です。ブラウザが開きます...${NC}"
  gcloud auth login
fi
echo ""

# 2. プロジェクト作成
echo -e "${BLUE}ステップ 2/8: プロジェクト作成${NC}"
if gcloud projects describe $PROJECT_ID &>/dev/null; then
  echo -e "${YELLOW}⚠️  プロジェクト既に存在します: ${PROJECT_ID}${NC}"
else
  gcloud projects create $PROJECT_ID --name="Whitepaper AI Agent" --set-as-default
  echo -e "${GREEN}✓ プロジェクト作成完了${NC}"
fi
echo ""

# 3. プロジェクトを設定
echo -e "${BLUE}ステップ 3/8: プロジェクトを設定${NC}"
gcloud config set project $PROJECT_ID
echo -e "${GREEN}✓ プロジェクト設定完了${NC}"
echo ""

# 4. 請求アカウント確認
echo -e "${BLUE}ステップ 4/8: 請求アカウント確認${NC}"
BILLING_ACCOUNT=$(gcloud billing accounts list --filter="open=true" --format="value(ACCOUNT_ID)" --limit=1)

if [ -z "$BILLING_ACCOUNT" ]; then
  echo -e "${RED}❌ 請求アカウントが見つかりません${NC}"
  echo ""
  echo "以下のURLから請求アカウントを作成してください："
  echo "https://console.cloud.google.com/billing"
  echo ""
  echo "作成後、以下のコマンドで再実行してください："
  echo "./setup-gcp-auto.sh"
  exit 1
else
  echo -e "${GREEN}✓ 請求アカウント検出: ${BILLING_ACCOUNT}${NC}"

  # プロジェクトに請求アカウントをリンク
  gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT
  echo -e "${GREEN}✓ 請求アカウントリンク完了${NC}"
fi
echo ""

# 5. 必要なAPIを有効化
echo -e "${BLUE}ステップ 5/8: 必要なAPIを有効化${NC}"
echo "以下のAPIを有効化します（数分かかる場合があります）..."
echo ""

gcloud services enable storage.googleapis.com --project=$PROJECT_ID
echo -e "${GREEN}✓ Cloud Storage API 有効化${NC}"

gcloud services enable vision.googleapis.com --project=$PROJECT_ID
echo -e "${GREEN}✓ Cloud Vision API 有効化${NC}"

gcloud services enable sheets.googleapis.com --project=$PROJECT_ID
echo -e "${GREEN}✓ Google Sheets API 有効化${NC}"

gcloud services enable drive.googleapis.com --project=$PROJECT_ID
echo -e "${GREEN}✓ Google Drive API 有効化${NC}"

gcloud services enable script.googleapis.com --project=$PROJECT_ID
echo -e "${GREEN}✓ Google Apps Script API 有効化${NC}"

echo ""

# 6. サービスアカウント作成
echo -e "${BLUE}ステップ 6/8: サービスアカウント作成${NC}"
SERVICE_ACCOUNT_NAME="whitepaper-agent"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL --project=$PROJECT_ID &>/dev/null; then
  echo -e "${YELLOW}⚠️  サービスアカウント既に存在します${NC}"
else
  gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
    --display-name="Whitepaper AI Agent" \
    --description="Service account for whitepaper generation system" \
    --project=$PROJECT_ID
  echo -e "${GREEN}✓ サービスアカウント作成完了${NC}"
fi
echo ""

# 7. ロール付与
echo -e "${BLUE}ステップ 7/8: ロール付与${NC}"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/storage.admin" \
  --condition=None
echo -e "${GREEN}✓ Storage Admin ロール付与${NC}"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/cloudvision.user" \
  --condition=None
echo -e "${GREEN}✓ Cloud Vision User ロール付与${NC}"

echo ""

# キーファイル作成
echo "サービスアカウントキーを作成しています..."
KEY_FILE_PATH="./gcp-service-account-key.json"

if [ -f "$KEY_FILE_PATH" ]; then
  echo -e "${YELLOW}⚠️  既存のキーファイルをバックアップします${NC}"
  mv $KEY_FILE_PATH "${KEY_FILE_PATH}.backup.$(date +%s)"
fi

gcloud iam service-accounts keys create $KEY_FILE_PATH \
  --iam-account=$SERVICE_ACCOUNT_EMAIL \
  --project=$PROJECT_ID

echo -e "${GREEN}✓ キーファイル作成完了: ${KEY_FILE_PATH}${NC}"
echo ""

# 8. Cloud Storageバケット作成
echo -e "${BLUE}ステップ 8/8: Cloud Storageバケット作成${NC}"
BUCKET_NAME="${PROJECT_ID}-uploads"

if gsutil ls -p $PROJECT_ID gs://$BUCKET_NAME &>/dev/null; then
  echo -e "${YELLOW}⚠️  バケット既に存在します: gs://${BUCKET_NAME}${NC}"
else
  gcloud storage buckets create gs://$BUCKET_NAME \
    --project=$PROJECT_ID \
    --location=asia-northeast1 \
    --uniform-bucket-level-access
  echo -e "${GREEN}✓ バケット作成完了: gs://${BUCKET_NAME}${NC}"
fi
echo ""

# .envファイル作成
echo -e "${BLUE}.envファイルを作成しています...${NC}"

# 既存の.envファイルがあればバックアップ
if [ -f ".env" ]; then
  echo -e "${YELLOW}⚠️  既存の.envファイルをバックアップします${NC}"
  mv .env .env.backup.$(date +%s)
fi

cat > .env <<EOF
# ============================================
# OpenAI Configuration（必須 - 手動で設定してください）
# ============================================
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview

# ============================================
# Google Cloud Platform（自動設定済み✓）
# ============================================
GCP_PROJECT_ID=$PROJECT_ID
GCP_KEY_FILENAME=$(pwd)/$KEY_FILE_PATH
GCS_BUCKET_NAME=$BUCKET_NAME

# ============================================
# GitHub Configuration（オプション）
# ============================================
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=ishiwatabunta
GITHUB_REPO=whitepaper-ai-agent

# ============================================
# Anthropic Claude API（オプション）
# ============================================
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# ============================================
# Server Configuration
# ============================================
PORT=3000
NODE_ENV=development
HOST=localhost

# ============================================
# Budget Limits
# ============================================
MAX_TOKENS_PER_DAY=1000000
MAX_COST_PER_DAY=10.0

# ============================================
# Logging Configuration
# ============================================
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE_PATH=./logs/app.log

# ============================================
# Circuit Breaker Configuration
# ============================================
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
CIRCUIT_BREAKER_RESET_TIMEOUT=30000

# ============================================
# Agent Configuration
# ============================================
AGENT_EXECUTION_TIMEOUT=300000
AGENT_MAX_RETRIES=3
AGENT_RETRY_DELAY=5000

# ============================================
# Webhook Configuration
# ============================================
WEBHOOK_SECRET=your_github_webhook_secret_here
WEBHOOK_PATH=/api/webhook

# ============================================
# Debug & Development
# ============================================
DEBUG=false
DRY_RUN=false
VERBOSE_LOGGING=false
EOF

echo -e "${GREEN}✓ .envファイル作成完了${NC}"
echo ""

# .gitignoreに追加
if ! grep -q "gcp-service-account-key.json" .gitignore 2>/dev/null; then
  echo "gcp-service-account-key.json" >> .gitignore
  echo -e "${GREEN}✓ .gitignoreに追加: gcp-service-account-key.json${NC}"
fi

echo ""
echo "════════════════════════════════════════════════════"
echo -e "${GREEN}🎉 GCPセットアップ完了！${NC}"
echo "════════════════════════════════════════════════════"
echo ""
echo -e "${YELLOW}次のステップ:${NC}"
echo ""
echo "1. OpenAI API Keyを取得:"
echo "   https://platform.openai.com/api-keys"
echo ""
echo "2. .envファイルを編集してOpenAI API Keyを設定:"
echo "   vi .env"
echo "   または"
echo "   code .env"
echo ""
echo "   以下の行を変更:"
echo "   OPENAI_API_KEY=your_openai_api_key_here"
echo "   ↓"
echo "   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx"
echo ""
echo "3. アプリケーションを起動:"
echo "   npm run dev"
echo ""
echo -e "${BLUE}設定内容:${NC}"
echo "  プロジェクトID: $PROJECT_ID"
echo "  バケット名: $BUCKET_NAME"
echo "  キーファイル: $KEY_FILE_PATH"
echo "  .envファイル: .env"
echo ""
echo "準備完了です！🚀"
