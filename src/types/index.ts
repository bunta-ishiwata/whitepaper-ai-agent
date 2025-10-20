import { Credentials } from 'google-auth-library';

/**
 * Agent Configuration
 * Defines the configuration structure for the AI agent system
 */
export interface AgentConfig {
  github: {
    token: string;
    owner: string;
    repo: string;
  };
  anthropic: {
    apiKey: string;
    model: string;
    maxTokens?: number;
  };
  budget: {
    maxTokensPerDay: number;
    maxCostPerDay: number;
  };
  openai?: {
    apiKey: string;
    model: string;
  };
  gcp?: {
    projectId: string;
    keyFilename: string;
    bucketName: string;
  };
}

/**
 * Agent State
 * Represents the current state of an agent
 */
export interface AgentState {
  status: 'idle' | 'planning' | 'executing' | 'reviewing' | 'completed' | 'failed';
  currentTask?: string;
  tokensUsed: number;
  costAccumulated: number;
  lastActivity: Date;
}

/**
 * Task Definition
 * Represents a task to be executed by an agent
 */
export interface Task {
  id: string;
  type: 'issue' | 'pr' | 'review' | 'refactor';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: number;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GitHub Event
 * Represents an event from GitHub webhooks
 */
export interface GitHubEvent {
  type: 'issue' | 'pull_request' | 'comment' | 'push';
  action: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Circuit Breaker State
 * Manages failure recovery for external service calls
 */
export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime?: Date;
  resetTime?: Date;
}

/**
 * Agent Result
 * Standard result structure for agent execution
 */
export interface AgentResult<T = unknown> {
  status: 'success' | 'failure' | 'partial';
  data?: T;
  error?: Error;
  metrics: AgentMetrics;
}

/**
 * Agent Metrics
 * Performance and execution metrics for an agent
 */
export interface AgentMetrics {
  taskId: string;
  agentType: string;
  durationMs: number;
  tokensUsed?: number;
  costUsd?: number;
  timestamp: string;
}

/**
 * GitHub Issue
 * Represents a GitHub issue
 */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  url: string;
}

/**
 * GitHub Pull Request
 * Represents a GitHub pull request
 */
export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  draft: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  createdAt: string;
  updatedAt: string;
  url: string;
}

/**
 * Code Generation Request
 * Request structure for code generation
 */
export interface CodeGenRequest {
  issueNumber: number;
  requirements: string;
  context?: {
    existingFiles?: string[];
    dependencies?: string[];
  };
}

/**
 * Code Generation Result
 * Result of code generation
 */
export interface CodeGenResult {
  files: GeneratedFile[];
  tests: GeneratedFile[];
  documentation: string;
  summary: string;
}

/**
 * Generated File
 * Represents a generated file
 */
export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

/**
 * Review Result
 * Result of code review
 */
export interface ReviewResult {
  approved: boolean;
  score: number;
  issues: ReviewIssue[];
  suggestions: string[];
  metrics: {
    complexity: number;
    coverage: number;
    maintainability: number;
  };
}

/**
 * Review Issue
 * Represents an issue found during code review
 */
export interface ReviewIssue {
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

/**
 * Webhook Payload
 * Generic webhook payload structure
 */
export interface WebhookPayload {
  action: string;
  issue?: GitHubIssue;
  pull_request?: GitHubPullRequest;
  repository: {
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  sender: {
    login: string;
  };
}

/**
 * Logger Interface
 * Standard logging interface
 */
export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Whitepaper Plan
 * Represents a structured plan for whitepaper following Japanese B2B marketing format
 * Based on agent-requirements.md Section 3
 */
export interface WhitepaperPlan {
  no: number;
  タイトル: string;
  目的: string;
  内容概要: string;
  感情的ニーズ: string;
  機能的ニーズ: string;
  成果的ニーズ: string;
  ニーズ複数: string;
  ターゲット: string;
  職種部署: string;
  レベル: string;
  構成: string;
  コメント: string;
}

/**
 * Parse Input
 * Input parameters for parsing sales and target documents with keywords
 */
export interface ParseInput {
  salesPdf?: string;
  salesText?: string;
  targetPdf?: string;
  targetText?: string;
  keywordsCsv?: string;
  keywordsText?: string;
}

/**
 * Parsed Context
 * Structured context extracted from sales/target documents and keywords
 */
export interface ParsedContext {
  salesText: string;
  targetText: string;
  keywords: string[];
}

/**
 * Session Data
 * Extended session data for OAuth2 authentication
 */
export interface SessionData {
  tokens?: Credentials;
  authenticated?: boolean;
}

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    tokens?: Credentials;
    authenticated?: boolean;
  }
}
