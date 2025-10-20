import type { AgentState } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class StateMachine {
  private state: AgentState;
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('StateMachine');
    this.state = {
      status: 'idle',
      tokensUsed: 0,
      costAccumulated: 0,
      lastActivity: new Date(),
    };
  }

  transition(
    newStatus: AgentState['status'],
    task?: string
  ): void {
    const oldStatus = this.state.status;
    this.state.status = newStatus;
    this.state.currentTask = task;
    this.state.lastActivity = new Date();

    this.logger.info(
      `State transition: ${oldStatus} -> ${newStatus}${task ? ` (task: ${task})` : ''}`
    );
  }

  recordUsage(tokens: number, cost: number): void {
    this.state.tokensUsed += tokens;
    this.state.costAccumulated += cost;
    this.state.lastActivity = new Date();
  }

  resetDailyUsage(): void {
    this.logger.info('Resetting daily usage counters');
    this.state.tokensUsed = 0;
    this.state.costAccumulated = 0;
  }

  getState(): AgentState {
    return { ...this.state };
  }

  isWithinBudget(maxTokens: number, maxCost: number): boolean {
    return this.state.tokensUsed < maxTokens && this.state.costAccumulated < maxCost;
  }
}
