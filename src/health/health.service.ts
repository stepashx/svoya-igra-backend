import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database/database.service';
import { StorageService } from '../infrastructure/storage/storage.service';

export type CheckStatus = 'ok' | 'error';

export interface CheckResult {
  status: CheckStatus;
  /** Short, secret-free reason when the check fails. */
  error?: string;
}

export interface HealthReport {
  status: CheckStatus;
  checks: {
    backend: CheckResult;
    database: CheckResult;
    storage: CheckResult;
  };
  timestamp: string;
}

/**
 * Aggregates backend liveness plus PostgreSQL and MinIO reachability. Probes
 * run in parallel and never throw — failures are captured per check with a
 * secret-free reason so the endpoint always returns a structured report.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, storage] = await Promise.all([
      this.runCheck(() => this.database.checkConnection()),
      this.runCheck(() => this.storage.checkConnection()),
    ]);

    const backend: CheckResult = { status: 'ok' };
    const status: CheckStatus =
      database.status === 'ok' && storage.status === 'ok' ? 'ok' : 'error';

    return {
      status,
      checks: { backend, database, storage },
      timestamp: new Date().toISOString(),
    };
  }

  private async runCheck(probe: () => Promise<void>): Promise<CheckResult> {
    try {
      await probe();
      return { status: 'ok' };
    } catch (error) {
      return { status: 'error', error: toSafeReason(error) };
    }
  }
}

/**
 * Reduce an error to a short, secret-free reason. Connection failures from
 * pg/minio carry codes like ECONNREFUSED, not credentials, so they are safe to
 * expose. pg wraps multi-address failures in an AggregateError whose own
 * message is empty, so unwrap the first underlying cause.
 */
function toSafeReason(error: unknown): string {
  if (error instanceof AggregateError && error.errors?.length) {
    return toSafeReason(error.errors[0]);
  }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const reason =
      error.message || (typeof code === 'string' ? code : '') || error.name;
    return reason.slice(0, 200);
  }
  return String(error).slice(0, 200);
}
