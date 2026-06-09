/**
 * Application-level transactional boundary. Use cases (sub-stage 5.2) wrap
 * multi-repository writes in `run(...)` so they commit or roll back atomically.
 *
 * Sub-stage 5.1 declares only the interface and token. The infrastructure
 * adapter — a Drizzle/AsyncLocalStorage implementation that makes the
 * repositories transaction-aware (their private `executor` resolves to the
 * ambient `tx`) — is deferred to 5.2.
 */
export interface TransactionPort {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export const TRANSACTION_PORT = Symbol('TransactionPort');
