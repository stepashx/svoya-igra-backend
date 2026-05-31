import { Global, Module } from '@nestjs/common';
import { CLOCK_PORT } from '../../core/ports/clock.port';
import { TOKEN_GENERATOR_PORT } from '../../core/ports/token-generator.port';
import { SystemClockAdapter } from './system-clock.adapter';
import { CryptoTokenGeneratorAdapter } from './crypto-token-generator.adapter';

/**
 * Binds the technology-agnostic shared ports to their concrete adapters.
 * Global so any feature area can inject the ports in later stages.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK_PORT, useClass: SystemClockAdapter },
    { provide: TOKEN_GENERATOR_PORT, useClass: CryptoTokenGeneratorAdapter },
  ],
  exports: [CLOCK_PORT, TOKEN_GENERATOR_PORT],
})
export class TechnicalAdaptersModule {}
