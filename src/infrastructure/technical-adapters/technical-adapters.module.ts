import { Global, Module } from '@nestjs/common';
import { CLOCK_PORT } from '../../core/ports/clock.port';
import { TOKEN_GENERATOR_PORT } from '../../core/ports/token-generator.port';
import { ID_GENERATOR_PORT } from '../../core/ports/id-generator.port';
import { RANDOM_GENERATOR_PORT } from '../../core/ports/randomness.port';
import { SystemClockAdapter } from './system-clock.adapter';
import { CryptoTokenGeneratorAdapter } from './crypto-token-generator.adapter';
import { CryptoIdGeneratorAdapter } from './crypto-id-generator.adapter';
import { CryptoRandomnessAdapter } from './crypto-randomness.adapter';

/**
 * Binds the technology-agnostic shared ports to their concrete adapters.
 * Global so any feature area can inject the ports in later stages.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK_PORT, useClass: SystemClockAdapter },
    { provide: TOKEN_GENERATOR_PORT, useClass: CryptoTokenGeneratorAdapter },
    { provide: ID_GENERATOR_PORT, useClass: CryptoIdGeneratorAdapter },
    { provide: RANDOM_GENERATOR_PORT, useClass: CryptoRandomnessAdapter },
  ],
  exports: [
    CLOCK_PORT,
    TOKEN_GENERATOR_PORT,
    ID_GENERATOR_PORT,
    RANDOM_GENERATOR_PORT,
  ],
})
export class TechnicalAdaptersModule {}
