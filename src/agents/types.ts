/**
 * Miyabi Agent Types
 * Claude Code統合のための型定義
 */

export interface AgentTask {
  id: string;
  type: 'feature' | 'bug' | 'refactor' | 'docs' | 'test' | 'deployment';
  description: string;
  dependencies: string[];
  estimatedMinutes: number;
  agentType: AgentType;
  issueNumber?: number;
}

export type AgentType =
  | 'coordinator'
  | 'codegen'
  | 'review'
  | 'issue'
  | 'pr'
  | 'deployment';

export interface TaskDAG {
  nodes: AgentTask[];
  edges: { from: string; to: string }[];
  levels: string[][];
}

export interface AgentExecutionResult {
  taskId: string;
  status: 'completed' | 'failed' | 'escalated';
  output?: string;
  error?: string;
  durationMs: number;
}

export interface CoordinatorInput {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  labels: string[];
}

export interface AgentContext {
  workingDirectory: string;
  issueNumber?: number;
  prNumber?: number;
  files?: string[];
}
