#!/bin/bash
# GCPプロジェクト自動セットアップスクリプト

set -e

echo "🚀 GCPプロジェクトセットアップを開始します"
echo ""

# カラー定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. プロジェクトID入力
echo -e "${BLUE}ステップ 1/7: プロジェクトIDを設定${NC}"
read -p "プロジェクトID（例: whitepaper-ai-12345）: " PROJECT_ID
echo ""

# 2. gcloud認証確認
echo -e "${BLUE}ステップ 2/7: Google Cloud認証${NC}"
echo "ブラウザが開くので、Googleアカウントでログインしてください..."
gcloud auth login
echo -e "${GREEN}✓ 認証完了${NC}"
echo ""

# 3. プロジェクト作成
echo -e "${BLUE}ステップ 3/7: プロジェクト作成${NC}"
gcloud projects create $PROJECT_ID --name="Whitepaper AI Agent"
echo -e "${GREEN}✓ プロジェクト作成完了${NC}"
echo ""

# 4. プロジェクトを有効化
echo -e "${BLUE}ステップ 4/7: プロジェクトを有効化${NC}"
gcloud config set project $PROJECT_ID
echo ""

# 請求アカウントの確認
echo -e "${YELLOW}⚠️  請求アカウントのリンクが必要です${NC}"
echo "以下のURLから請求アカウントをリンクしてください："
echo "https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
echo ""
read -p "請求アカウントのリンクが完了したら Enter を押してください..."
echo ""

# 5. 必要なAPIを有効化
echo -e "${BLUE}ステップ 5/7: 必要なAPIを有効化${NC}"
echo "以下のAPIを有効化します："
echo "  - Cloud Storage API"
echo "  - Cloud Vision API"
echo "  - Google Sheets API"
echo "  - Google Drive API"
echo "  - Google Apps Script API"
echo ""

gcloud services enable storage.googleapis.com
echo -e "${GREEN}✓ Cloud Storage API 有効化${NC}"

gcloud services enable vision.googleapis.com
echo -e "${GREEN}✓ Cloud Vision API 有効化${NC}"

gcloud services enable sheets.googleapis.com
echo -e "${GREEN}✓ Google Sheets API 有効化${NC}"

gcloud services enable drive.googleapis.com
echo -e "${GREEN}✓ Google Drive API 有効化${NC}"

gcloud services enable script.googleapis.com
echo -e "${GREEN}✓ Google Apps Script API 有効化${NC}"

echo ""

# 6. サービスアカウント作成
echo -e "${BLUE}ステップ 6/7: サービスアカウント作成${NC}"
SERVICE_ACCOUNT_NAME="whitepaper-agent"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="Whitepaper AI Agent" \
  --description="Service account for whitepaper generation system"

echo -e "${GREEN}✓ サービスアカウント作成完了${NC}"
echo ""

# ロール付与
echo "必要なロールを付与しています..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/storage.admin"
echo -e "${GREEN}✓ Storage Admin ロール付与${NC}"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/cloudvision.user"
echo -e "${GREEN}✓ Cloud Vision User ロール付与${NC}"

echo ""

# キーファイル作成
echo "サービスアカウントキーを作成しています..."
KEY_FILE_PATH="./gcp-service-account-key.json"
gcloud iam service-accounts keys create $KEY_FILE_PATH \
  --iam-account=$SERVICE_ACCOUNT_EMAIL

echo -e "${GREEN}✓ キーファイル作成完了: ${KEY_FILE_PATH}${NC}"
echo ""

# 7. Cloud Storageバケット作成
echo -e "${BLUE}ステップ 7/7: Cloud Storageバケット作成${NC}"
BUCKET_NAME="${PROJECT_ID}-whitepaper-uploads"

gcloud storage buckets create gs://$BUCKET_NAME \
  --project=$PROJECT_ID \
  --location=asia-northeast1 \
  --uniform-bucket-level-access

echo -e "${GREEN}✓ バケット作成完了: gs://${BUCKET_NAME}${NC}"
echo ""

# .envファイル作成
echo -e "${BLUE}.envファイルを作成しています...${NC}"
cat > .env <<EOF
# ============================================
# OpenAI Configuration（必須 - 手動で設定してください）
# ============================================
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview

# ============================================
# Google Cloud Platform（自動設定済み）
# ============================================
GCP_PROJECT_ID=$PROJECT_ID
GCP_KEY_FILENAME=$(pwd)/$KEY_FILE_PATH
GCS_BUCKET_NAME=$BUCKET_NAME

# ============================================
# GitHub Configuration（オプション）
# ============================================
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=$(git config user.name || echo "your_github_username")
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
EOF

echo -e "${GREEN}✓ .envファイル作成完了${NC}"
echo ""

# 完了メッセージ
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
