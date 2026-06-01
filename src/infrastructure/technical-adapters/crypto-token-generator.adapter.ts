import { Injectable } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { TokenGeneratorPort } from '../../core/ports/token-generator.port';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Crypto-backed implementation of TokenGeneratorPort. */
@Injectable()
export class CryptoTokenGeneratorAdapter implements TokenGeneratorPort {
  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  generateRoomCode(length: number): string {
    let code = '';
    for (let i = 0; i < length; i += 1) {
      code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }
}
