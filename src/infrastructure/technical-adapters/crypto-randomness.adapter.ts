import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { RandomGeneratorPort } from '../../core/ports/randomness.port';

/** Crypto-backed implementation of {@link RandomGeneratorPort}. */
@Injectable()
export class CryptoRandomnessAdapter implements RandomGeneratorPort {
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('Cannot pick from an empty list.');
    }
    return items[randomInt(items.length)];
  }

  shuffle<T>(items: readonly T[]): T[] {
    // Fisher–Yates with crypto-strong indices.
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
