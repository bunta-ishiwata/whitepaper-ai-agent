import type { AgentConfig } from '../types/index.js';

export function loadConfig(): AgentConfig {
  return {
    github: {
      token: process.env.GITHUB_TOKEN || '',
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },
    budget: {
      maxTokensPerDay: parseInt(process.env.MAX_TOKENS_PER_DAY || '1000000', 10),
      maxCostPerDay: parseFloat(process.env.MAX_COST_PER_DAY || '10.0'),
    },
  };
}

export function validateConfig(config: AgentConfig): boolean {
  if (!config.github.token) {
    console.error('GITHUB_TOKEN is required');
    return false;
  }
  if (!config.github.owner) {
    console.error('GITHUB_OWNER is required');
    return false;
  }
  if (!config.github.repo) {
    console.error('GITHUB_REPO is required');
    return false;
  }
  if (!config.anthropic.apiKey) {
    console.error('ANTHROPIC_API_KEY is required');
    return false;
  }
  return true;
}
