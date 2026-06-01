import { Module } from '@nestjs/common';

/**
 * Commerce feature area — placeholder shell only (Stage 3A).
 *
 * Later: shop catalog, captain-only "first to buy" purchases, balance debit
 * (delegated to Scoring), inventory, and QR-tool content metadata. QrTools
 * lives here as content, not as its own module. No logic exists yet.
 */
@Module({})
export class CommerceModule {}
