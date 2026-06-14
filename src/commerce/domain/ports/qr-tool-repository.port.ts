import { QrTool } from '../entities';

/**
 * Persistence port for the global QR-tool catalog (plan §15.9). Read-only —
 * QR tools are seed-managed. `listByIds` serves the team inventory view (the
 * tools behind a team's inventory entries) in one round trip. The Drizzle
 * adapter lives in infrastructure/persistence.
 */
export interface QrToolRepositoryPort {
  findById(id: string): Promise<QrTool | null>;
  listByIds(ids: string[]): Promise<QrTool[]>;
}

export const QR_TOOL_REPOSITORY_PORT = Symbol('QrToolRepositoryPort');
