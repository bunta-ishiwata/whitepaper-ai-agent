export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, ...args: unknown[]): void {
    console.log(`[${new Date().toISOString()}] [${this.context}] INFO:`, message, ...args);
  }

  error(message: string, error?: Error | unknown): void {
    console.error(`[${new Date().toISOString()}] [${this.context}] ERROR:`, message, error);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[${new Date().toISOString()}] [${this.context}] WARN:`, message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (process.env.DEBUG) {
      console.debug(`[${new Date().toISOString()}] [${this.context}] DEBUG:`, message, ...args);
    }
  }
}
