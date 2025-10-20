# Whitepaper AI Agent

An autonomous AI-powered service for generating whitepaper plans based on sales materials, target audience analysis, and keyword research. Built with Express.js, TypeScript, and integrated with Google Cloud services and OpenAI.

## Overview

The Whitepaper AI Agent automates the process of creating structured whitepaper plans by analyzing:
- Sales materials (PDF or text)
- Target audience information (PDF or text)
- Keywords and topics (CSV or text)

The system generates multiple whitepaper plan proposals, each containing structured sections, target audience insights, estimated page counts, and priority rankings. Results are automatically saved to Google Sheets for easy collaboration and review.

## Features

- **OAuth2 User Authentication**: Secure Google OAuth2 flow for user-owned Google Drive access
- **Multi-format Input Support**: Accept PDFs, text, and CSV files
- **AI-Powered Plan Generation**: Uses OpenAI GPT models for intelligent content planning
- **Google Cloud Integration**: Cloud Storage for file handling and Vision API for PDF text extraction
- **Automated Sheet Creation**: Generates formatted Google Sheets with whitepaper plans in user's Google Drive
- **Comprehensive Error Handling**: Circuit breaker patterns and detailed logging
- **RESTful API**: Clean, well-documented HTTP endpoints
- **Type-Safe**: Built with TypeScript for reliability
- **Fully Tested**: Integration tests with Vitest

## Architecture

```
├── src/
│   ├── agents/          # AI agent coordination logic
│   ├── routes/          # Express route handlers
│   ├── services/        # Business logic services
│   │   ├── storage.ts   # Google Cloud Storage operations
│   │   ├── parser.ts    # PDF/text parsing with Vision API
│   │   ├── llm.ts       # OpenAI integration for plan generation
│   │   ├── sheets.ts    # Google Sheets API integration
│   │   └── gas.ts       # Google Apps Script deployment
│   ├── state/           # State management and circuit breaker
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Logging and configuration utilities
│   └── index.ts         # Application entry point
├── docs/                # API specifications
└── tests/               # Test files
```

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Google Cloud Platform account
- OpenAI API key
- GitHub account (for autonomous agent features)
- Anthropic API key (optional, for Claude integration)

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/whitepaper-ai-agent.git
cd whitepaper-ai-agent
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required: GitHub Configuration
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=your_github_username
GITHUB_REPO=whitepaper-ai-agent

# Required: Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Required: OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview

# Required: Google Cloud Platform (for file storage and Vision API)
GCP_PROJECT_ID=your_gcp_project_id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
GCS_BUCKET_NAME=your_gcs_bucket_name

# Required: Google OAuth2 (for user authentication)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=your_random_session_secret_here

# Optional: Server Configuration
PORT=3000
NODE_ENV=development
HOST=localhost
```

### 4. Set Up Google Cloud Services

#### Create a GCP Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the following APIs:
   - Cloud Storage API
   - Cloud Vision API
   - Google Sheets API
   - Google Drive API

#### Create a Service Account (for Cloud Storage and Vision API)
1. Navigate to "IAM & Admin" > "Service Accounts"
2. Create a new service account
3. Grant the following roles:
   - Storage Admin
   - Cloud Vision User
4. Create and download a JSON key file
5. Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of this key file

#### Create OAuth2 Credentials (for User Authentication)
1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client ID"
3. Configure the consent screen:
   - User Type: External (for testing) or Internal (for organization)
   - App name: Whitepaper AI Agent
   - User support email: your email
   - Developer contact: your email
4. Create OAuth Client ID:
   - Application type: Web application
   - Name: Whitepaper AI Agent
   - Authorized redirect URIs: `http://localhost:3000/auth/callback`
   - For production, add your production URL (e.g., `https://yourdomain.com/auth/callback`)
5. Copy the Client ID and Client Secret
6. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your `.env` file
7. Add test users to the OAuth consent screen if using External user type

#### Create a Cloud Storage Bucket
```bash
gsutil mb gs://your-bucket-name
```

#### Generate Session Secret
Generate a secure random string for session encryption:
```bash
# On Linux/macOS
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Set this value as `SESSION_SECRET` in your `.env` file.

### 5. Start the Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or your configured PORT).

## API Documentation

### Authentication Flow

The API uses OAuth2 for user authentication. Users must authenticate before creating spreadsheets.

#### 1. Check Authentication Status

```http
GET /auth/status
```

Check if you are currently authenticated.

**Response (Not Authenticated):**
```json
{
  "authenticated": false,
  "hasTokens": false,
  "message": "You are not authenticated. Please visit /auth/login to authenticate",
  "loginUrl": "/auth/login"
}
```

**Response (Authenticated):**
```json
{
  "authenticated": true,
  "hasTokens": true,
  "message": "You are authenticated and can use the /generate endpoint",
  "loginUrl": null
}
```

#### 2. Initiate OAuth2 Login

```http
GET /auth/login
```

Redirects to Google OAuth consent screen. After user grants permission, Google redirects back to `/auth/callback`.

**Browser Usage:**
```
http://localhost:3000/auth/login
```

#### 3. OAuth2 Callback

```http
GET /auth/callback?code=...
```

Automatically called by Google after user consent. Saves authentication tokens to session.

**Response:**
```json
{
  "success": true,
  "message": "Authentication successful! You can now use the /generate endpoint.",
  "authenticated": true,
  "nextSteps": {
    "endpoint": "/generate",
    "method": "POST",
    "description": "You can now create Google Sheets in your own Google Drive"
  }
}
```

#### 4. Logout

```http
POST /auth/logout
```

Clears the session and logs out the user.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Health Check

```http
GET /health
```

Returns server status and uptime information.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-16T12:00:00.000Z",
  "uptime": 123.45
}
```

### Generate Whitepaper Plans

```http
POST /generate
Content-Type: multipart/form-data
```

**Authentication Required**: You must authenticate via `/auth/login` before using this endpoint.

Generates whitepaper plans based on provided inputs and creates a Google Sheet in the authenticated user's Google Drive.

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `salesPdf` | File | No | Sales material PDF file |
| `salesText` | String | No | Sales material as text |
| `targetPdf` | File | No | Target audience PDF file |
| `targetText` | String | No | Target audience as text |
| `keywordsCsv` | File | No | Keywords CSV file |
| `keywordsText` | String | No | Keywords as comma-separated text |
| `planCount` | Number | No | Number of plans to generate (default: 3, max: 20) |
| `spreadsheetTitle` | String | No | Custom spreadsheet title |
| `folderId` | String | No | Google Drive folder ID to move spreadsheet |

**Note:** At least one input source (sales, target, or keywords) must be provided.

**Example Request (cURL with files):**

Note: You must have an active session cookie from authenticating via `/auth/login`.

```bash
# First, authenticate in a browser by visiting:
# http://localhost:3000/auth/login

# Then, use curl with cookies to make requests:
curl -X POST http://localhost:3000/generate \
  -b cookies.txt \
  -F "salesPdf=@sales-materials.pdf" \
  -F "targetPdf=@target-audience.pdf" \
  -F "keywordsText=AI,machine learning,automation,enterprise" \
  -F "planCount=5" \
  -F "spreadsheetTitle=Q4 Whitepaper Plans"
```

**Example Request (cURL with text):**

```bash
curl -X POST http://localhost:3000/generate \
  -F "salesText=Our product is an AI-powered automation platform..." \
  -F "targetText=Enterprise CTOs and IT decision makers..." \
  -F "keywordsText=AI,automation,cloud" \
  -F "planCount=3"
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "spreadsheetId": "1abc123def456...",
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/1abc123def456...",
  "planCount": 3,
  "plans": [
    {
      "title": "AI-Driven Automation for Enterprise",
      "section": "Introduction",
      "estimatedPages": 5,
      "priority": 1,
      "status": "draft"
    },
    {
      "title": "Implementation Guide",
      "section": "Technical Overview",
      "estimatedPages": 8,
      "priority": 2,
      "status": "draft"
    }
  ],
  "metadata": {
    "duration": "5432ms",
    "timestamp": "2025-10-16T12:00:00.000Z"
  }
}
```

**Error Response (401 Unauthorized):**

```json
{
  "error": "Unauthorized",
  "message": "You must authenticate before using this endpoint",
  "loginUrl": "/auth/login",
  "authFlow": {
    "step1": "Visit /auth/login to authenticate with your Google account",
    "step2": "After authentication, you can create spreadsheets in your Google Drive"
  }
}
```

**Error Response (400 Bad Request):**

```json
{
  "error": "Bad Request",
  "message": "At least one input source (sales, target, or keywords) must be provided"
}
```

**Error Response (500 Internal Server Error):**

```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "Failed to generate whitepaper plans",
  "metadata": {
    "duration": "1234ms",
    "timestamp": "2025-10-16T12:00:00.000Z"
  }
}
```

## Testing

### Run All Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

### Run Specific Test File

```bash
npm test src/routes/generate.test.ts
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

## Development

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Build for Production

```bash
npm run build
```

This creates optimized JavaScript files in the `dist/` directory.

## Deployment

### Deploy to Google Cloud Run

1. **Build Docker Image:**

```bash
docker build -t gcr.io/YOUR_PROJECT_ID/whitepaper-ai-agent .
```

2. **Push to Google Container Registry:**

```bash
docker push gcr.io/YOUR_PROJECT_ID/whitepaper-ai-agent
```

3. **Deploy to Cloud Run:**

```bash
gcloud run deploy whitepaper-ai-agent \
  --image gcr.io/YOUR_PROJECT_ID/whitepaper-ai-agent \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production"
```

4. **Set Environment Variables:**

```bash
gcloud run services update whitepaper-ai-agent \
  --update-env-vars="OPENAI_API_KEY=your_key,GCP_PROJECT_ID=your_project_id" \
  --region us-central1
```

### Using Cloud Build

The project includes a `cloudbuild.yaml` configuration for automated deployments:

```bash
gcloud builds submit --config cloudbuild.yaml
```

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for plan generation | `sk-...` |
| `GCP_PROJECT_ID` | Google Cloud Platform project ID | `my-project-123` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account key (for Storage/Vision) | `/path/to/key.json` |
| `GCS_BUCKET_NAME` | Cloud Storage bucket name | `whitepaper-uploads` |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID | `123-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret | `GOCSPX-...` |
| `GOOGLE_REDIRECT_URI` | OAuth2 redirect URI | `http://localhost:3000/auth/callback` |
| `SESSION_SECRET` | Secret for session encryption | `random-string-here` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `HOST` | Server host | `0.0.0.0` |
| `NODE_ENV` | Environment mode | `development` |
| `OPENAI_MODEL` | OpenAI model to use | `gpt-4` |
| `OPENAI_MAX_TOKENS` | Max tokens for generation | `4096` |
| `OPENAI_TEMPERATURE` | Model temperature | `0.7` |
| `LOG_LEVEL` | Logging level | `info` |

## Usage Guide

### Quick Start

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Authenticate with Google:**
   - Open your browser and visit: `http://localhost:3000/auth/login`
   - Sign in with your Google account
   - Grant permissions for Google Sheets and Drive access
   - You'll be redirected to a success page

3. **Generate whitepaper plans:**
   - Use the `/generate` endpoint with your sales materials, target audience info, and keywords
   - The spreadsheet will be created in your authenticated Google Drive

4. **Check your Google Drive:**
   - Find the newly created spreadsheet in your Google Drive
   - It will contain all generated whitepaper plans with formatting

### Example Workflow

```bash
# 1. Check authentication status
curl http://localhost:3000/auth/status

# 2. If not authenticated, visit in browser:
# http://localhost:3000/auth/login

# 3. After authentication, generate plans (in browser or with session cookies)
curl -X POST http://localhost:3000/generate \
  -b cookies.txt \
  -F "salesText=Our AI platform helps businesses automate workflows..." \
  -F "targetText=Enterprise IT decision makers and CTOs..." \
  -F "keywordsText=AI,automation,enterprise" \
  -F "planCount=5"

# 4. Logout when done (optional)
curl -X POST http://localhost:3000/auth/logout -b cookies.txt
```

## Project Structure Details

### Services

- **AuthService**: Handles OAuth2 authentication flow with Google
- **StorageService**: Handles file uploads/downloads to Google Cloud Storage
- **ParserService**: Extracts text from PDFs using Google Vision API
- **LLMService**: Generates whitepaper plans using OpenAI GPT models
- **SheetsService**: Creates and manages Google Sheets (supports OAuth2 and service accounts)
- **GASService**: Deploys Google Apps Script automation

### State Management

- **CircuitBreaker**: Prevents cascade failures from external service issues
- **StateMachine**: Manages agent state transitions

### Agents

- **Coordinator**: Orchestrates multi-agent workflows for autonomous development

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions, please open an issue on GitHub.

## Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- Powered by [OpenAI GPT](https://openai.com/)
- Integrated with [Google Cloud Platform](https://cloud.google.com/)
- Type-safe with [TypeScript](https://www.typescriptlang.org/)
- Tested with [Vitest](https://vitest.dev/)
