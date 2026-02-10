export type RetryOptions = {
  retries: number;
  delayMs: number;
  factor?: number;
};

export const retry = async <T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> => {
  const factor = options.factor ?? 2;
  let attempt = 0;
  let delay = options.delayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > options.retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= factor;
    }
  }
};
