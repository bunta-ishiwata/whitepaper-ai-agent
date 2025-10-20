#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Whitepaper AI Agent - Deployment Script            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No GCP project configured. Run 'gcloud config set project PROJECT_ID'${NC}"
    exit 1
fi

PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

echo -e "${GREEN}✓ Project: $PROJECT_ID${NC}"
echo -e "${GREEN}✓ Project Number: $PROJECT_NUMBER${NC}"
echo ""

# Function to check if secret exists
secret_exists() {
    gcloud secrets describe "$1" &>/dev/null
}

# Function to create or update secret
create_or_update_secret() {
    local secret_name=$1
    local secret_value=$2

    if secret_exists "$secret_name"; then
        echo -e "${YELLOW}→ Secret '$secret_name' already exists. Creating new version...${NC}"
        echo -n "$secret_value" | gcloud secrets versions add "$secret_name" --data-file=- >/dev/null
    else
        echo -e "${BLUE}→ Creating secret '$secret_name'...${NC}"
        echo -n "$secret_value" | gcloud secrets create "$secret_name" --data-file=- --replication-policy="automatic" >/dev/null
    fi
    echo -e "${GREEN}✓ Secret '$secret_name' ready${NC}"
}

# Function to grant secret access to service account
grant_secret_access() {
    local secret_name=$1
    local service_account="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

    echo -e "${BLUE}→ Granting access to '$secret_name' for Cloud Run service account...${NC}"
    gcloud secrets add-iam-policy-binding "$secret_name" \
        --member="serviceAccount:$service_account" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet >/dev/null
    echo -e "${GREEN}✓ Access granted for '$secret_name'${NC}"
}

echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Step 1: Setting up secrets${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""

# Check if .env file exists
if [ -f ".env" ]; then
    echo -e "${GREEN}Found .env file. Using values from .env${NC}"
    echo ""

    # Load .env file
    export $(cat .env | grep -v '^#' | xargs)

    # OPENAI_API_KEY
    if [ -n "$OPENAI_API_KEY" ]; then
        create_or_update_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"
        grant_secret_access "OPENAI_API_KEY"
    else
        echo -e "${YELLOW}⚠ OPENAI_API_KEY not found in .env${NC}"
    fi

    # GOOGLE_CLIENT_ID
    if [ -n "$GOOGLE_CLIENT_ID" ]; then
        create_or_update_secret "GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID"
        grant_secret_access "GOOGLE_CLIENT_ID"
    else
        echo -e "${YELLOW}⚠ GOOGLE_CLIENT_ID not found in .env${NC}"
    fi

    # GOOGLE_CLIENT_SECRET
    if [ -n "$GOOGLE_CLIENT_SECRET" ]; then
        create_or_update_secret "GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET"
        grant_secret_access "GOOGLE_CLIENT_SECRET"
    else
        echo -e "${YELLOW}⚠ GOOGLE_CLIENT_SECRET not found in .env${NC}"
    fi

    # SESSION_SECRET
    if [ -n "$SESSION_SECRET" ]; then
        create_or_update_secret "SESSION_SECRET" "$SESSION_SECRET"
        grant_secret_access "SESSION_SECRET"
    else
        echo -e "${YELLOW}⚠ SESSION_SECRET not found in .env. Generating new one...${NC}"
        SESSION_SECRET=$(openssl rand -base64 32)
        create_or_update_secret "SESSION_SECRET" "$SESSION_SECRET"
        grant_secret_access "SESSION_SECRET"
    fi

    # GCS_BUCKET_NAME
    if [ -n "$GCS_BUCKET_NAME" ]; then
        create_or_update_secret "GCS_BUCKET_NAME" "$GCS_BUCKET_NAME"
        grant_secret_access "GCS_BUCKET_NAME"
    else
        echo -e "${YELLOW}⚠ GCS_BUCKET_NAME not found in .env${NC}"
    fi
else
    echo -e "${YELLOW}No .env file found. Please enter values manually:${NC}"
    echo ""

    # Manual input
    read -p "Enter OPENAI_API_KEY: " OPENAI_API_KEY
    create_or_update_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"
    grant_secret_access "OPENAI_API_KEY"

    read -p "Enter GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
    create_or_update_secret "GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID"
    grant_secret_access "GOOGLE_CLIENT_ID"

    read -p "Enter GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET
    create_or_update_secret "GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET"
    grant_secret_access "GOOGLE_CLIENT_SECRET"

    echo -e "${BLUE}Generating SESSION_SECRET...${NC}"
    SESSION_SECRET=$(openssl rand -base64 32)
    create_or_update_secret "SESSION_SECRET" "$SESSION_SECRET"
    grant_secret_access "SESSION_SECRET"

    read -p "Enter GCS_BUCKET_NAME: " GCS_BUCKET_NAME
    create_or_update_secret "GCS_BUCKET_NAME" "$GCS_BUCKET_NAME"
    grant_secret_access "GCS_BUCKET_NAME"
fi

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Step 2: Building and deploying${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""

# Build and deploy
echo -e "${BLUE}→ Starting Cloud Build...${NC}"
gcloud builds submit --config=cloudbuild.yaml .

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Deployment completed successfully!                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Get service URL
SERVICE_URL=$(gcloud run services describe whitepaper-agent --region=asia-northeast1 --format='value(status.url)' 2>/dev/null)

if [ -n "$SERVICE_URL" ]; then
    echo -e "${GREEN}✓ Service URL: $SERVICE_URL${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "1. Update Google OAuth2 redirect URI to: ${BLUE}$SERVICE_URL/auth/callback${NC}"
    echo -e "2. Visit ${BLUE}$SERVICE_URL${NC} to test the application"
    echo -e "3. Check logs: ${BLUE}gcloud run services logs read whitepaper-agent --region=asia-northeast1${NC}"
else
    echo -e "${YELLOW}⚠ Could not retrieve service URL. Check deployment status with:${NC}"
    echo -e "${BLUE}gcloud run services list --region=asia-northeast1${NC}"
fi

echo ""
