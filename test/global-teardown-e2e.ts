/**
 * Runs once after the e2e suite. Each spec closes its own Nest app and pg pool,
 * so there is nothing global to clean up; the hook exists to satisfy the jest
 * `globalTeardown` contract and as a seam for future shared resources.
 */
export default async function globalTeardown(): Promise<void> {
  // No shared global resources to release.
}
