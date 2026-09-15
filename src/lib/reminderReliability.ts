export type ReminderOperationResult<T> = {
  data: T;
  error: unknown | null;
};

export type ReminderRetryNotice = {
  attempt: number;
  error: unknown;
};

const wait = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export async function withReminderOperationRetry<T extends ReminderOperationResult<unknown>>(
  operation: () => PromiseLike<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    sleep?: (delayMs: number) => Promise<void>;
    onRetry?: (notice: ReminderRetryNotice) => void;
  } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 75);
  const sleep = options.sleep ?? wait;
  let lastThrown: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation();
      if (!result.error || attempt === maxAttempts) return result;
      options.onRetry?.({ attempt, error: result.error });
    } catch (error) {
      lastThrown = error;
      if (attempt === maxAttempts) throw error;
      options.onRetry?.({ attempt, error });
    }

    await sleep(baseDelayMs * attempt);
  }

  throw lastThrown ?? new Error("reminder_operation_failed");
}

export function reminderOperationErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  if (error instanceof Error && error.name) return error.name;
  return "unknown";
}

export function buildReminderDispatchOutcome(input: {
  sent: number;
  skipped: number;
  failed: number;
  skipReasons: Record<string, number>;
  failureReasons: Record<string, number>;
}) {
  const ok = input.failed === 0;
  return {
    status: ok ? 200 : 503,
    payload: { ok, ...input },
  } as const;
}

export function canRetryQueuedReminderDelivery(
  delivery: { status?: string | null; provider_id?: string | null; created_at?: string | null },
  now = new Date(),
): boolean {
  if (delivery.status !== "queued" || delivery.provider_id || !delivery.created_at) return false;
  const createdAt = new Date(delivery.created_at).getTime();
  if (!Number.isFinite(createdAt)) return false;
  const ageMs = now.getTime() - createdAt;
  return ageMs >= 0 && ageMs < 23 * 60 * 60 * 1000;
}
