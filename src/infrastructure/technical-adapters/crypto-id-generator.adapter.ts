import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IdGeneratorPort } from '../../core/ports/id-generator.port';

/** Crypto-backed implementation of IdGeneratorPort (UUID v4). */
@Injectable()
export class CryptoIdGeneratorAdapter implements IdGeneratorPort {
  generate(): string {
    return randomUUID();
  }
}
