import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DrizzleTransaction } from './database.types';

/**
 * Ambient transaction holder backed by AsyncLocalStorage. The transaction
 * adapter installs the active Drizzle transaction here for the duration of a
 * `run(...)` callback; transaction-aware repositories read {@link current} so
 * their queries execute on the ambient `tx` instead of the pooled client. A
 * single app-wide singleton — one AsyncLocalStorage instance.
 */
@Injectable()
export class TransactionContext {
  private readonly storage = new AsyncLocalStorage<DrizzleTransaction>();

  /** The ambient transaction, or `undefined` when not inside one. */
  get current(): DrizzleTransaction | undefined {
    return this.storage.getStore();
  }

  /** Run `work` with `tx` installed as the ambient transaction. */
  run<T>(tx: DrizzleTransaction, work: () => Promise<T>): Promise<T> {
    return this.storage.run(tx, work);
  }
}
