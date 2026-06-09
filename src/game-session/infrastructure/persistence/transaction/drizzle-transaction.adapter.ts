import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../../infrastructure/database/transaction-context';
import { TransactionPort } from '../../../application/ports';

/**
 * Drizzle/AsyncLocalStorage implementation of {@link TransactionPort}. Opens a
 * real database transaction and installs it as the ambient transaction (via
 * {@link TransactionContext}) for the duration of `work`, so the four
 * transaction-aware repositories transparently route their queries onto it.
 *
 * Re-entrant: when a transaction is already ambient, `run` simply invokes
 * `work` on the existing one (no nested BEGIN). Drizzle never leaks past this
 * adapter — the port speaks only `() => Promise<T>`.
 */
@Injectable()
export class DrizzleTransactionAdapter implements TransactionPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.txContext.current) {
      return work();
    }
    return this.database.transaction((tx) => this.txContext.run(tx, work));
  }
}
