/**
 * Stored QR-tool file format (plan §12), declared as the domain's OWN union
 * literal — SVG only in MVP.
 *
 * The domain never imports the Drizzle schema (`_shared/enums.ts`) — keeping it
 * free of infrastructure. Conformance with the persistence column is enforced
 * at compile time by the qr-tool mapper: the schema-union value is assigned to
 * this domain union on read; the assignment only type-checks while the two
 * unions stay identical, so any drift breaks the build.
 */
export type QrFileFormat = 'SVG';
