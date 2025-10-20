import type { CircuitBreakerState } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly logger: Logger;

  constructor(failureThreshold = 5, resetTimeout = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.logger = new Logger('CircuitBreaker');
    this.state = {
      isOpen: false,
      failureCount: 0,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.isOpen) {
      if (this.shouldAttemptReset()) {
        this.logger.info('Attempting to reset circuit breaker');
        this.state.isOpen = false;
        this.state.failureCount = 0;
      } else {
        throw new Error('Circuit breaker is open. Operation blocked.');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.state.failureCount = 0;
    this.state.lastFailureTime = undefined;
  }

  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = new Date();

    if (this.state.failureCount >= this.failureThreshold) {
      this.state.isOpen = true;
      this.state.resetTime = new Date(Date.now() + this.resetTimeout);
      this.logger.warn(
        `Circuit breaker opened after ${this.state.failureCount} failures. Will reset at ${this.state.resetTime}`
      );
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.state.resetTime) return false;
    return Date.now() >= this.state.resetTime.getTime();
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}
