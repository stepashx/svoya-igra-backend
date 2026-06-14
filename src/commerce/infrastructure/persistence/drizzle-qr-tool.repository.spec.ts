import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { DrizzleQrToolRepository } from './drizzle-qr-tool.repository';

/**
 * Focused on the cross-cutting behaviour: executor selection (ambient tx vs.
 * pooled client), the batch lookup and its empty-input no-op. The payload/
 * storage-dropping mapping is covered by the mapper spec. `qr_tools` writes
 * are seed-owned, so there is no 23505 path to test.
 */
describe('DrizzleQrToolRepository (tx-awareness + batch lookup)', () => {
  const row = {
    id: 'qr-1',
    title: 'Double points QR',
    description: null,
    payload: null,
    fileFormat: 'SVG',
    storageProvider: 'minio',
    bucket: 'qr-tools',
    storageKey: 'qr-1.svg',
    publicUrl: 'https://minio.local/qr-tools/qr-1.svg',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  /** A fake executor whose select-chains resolve to fixtures. */
  const makeExecutor = (rows: unknown[] = []) => {
    const limit = jest.fn(() => Promise.resolve(rows));
    const where = jest.fn(() =>
      Object.assign(Promise.resolve(rows), { limit }),
    );
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    return { select, from, where, limit };
  };

  const makeRepo = (
    db: ReturnType<typeof makeExecutor>,
    tx?: ReturnType<typeof makeExecutor>,
  ) =>
    new DrizzleQrToolRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

  it('findById maps the row, or null when none', async () => {
    await expect(
      makeRepo(makeExecutor([row])).findById('qr-1'),
    ).resolves.toMatchObject({
      id: 'qr-1',
      publicUrl: 'https://minio.local/qr-tools/qr-1.svg',
    });

    await expect(
      makeRepo(makeExecutor([])).findById('missing'),
    ).resolves.toBeNull();
  });

  it('listByIds maps every row of the batch', async () => {
    const tools = await makeRepo(makeExecutor([row])).listByIds(['qr-1']);
    expect(tools).toHaveLength(1);
    expect(tools[0].fileFormat).toBe('SVG');
  });

  it('does not query at all for an empty id list', async () => {
    const db = makeExecutor([row]);
    await expect(makeRepo(db).listByIds([])).resolves.toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('runs reads on the ambient transaction when one is active', async () => {
    const db = makeExecutor([]);
    const tx = makeExecutor([]);
    await makeRepo(db, tx).listByIds(['qr-1']);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(db.select).not.toHaveBeenCalled();
  });
});
