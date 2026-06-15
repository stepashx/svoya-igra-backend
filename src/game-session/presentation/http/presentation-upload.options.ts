import { BadRequestException } from '@nestjs/common';
import { MulterModuleOptions } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../../../config/app-config.service';

/**
 * Multer config for the presentation upload route (sub-stage 9.3), used by
 * `MulterModule.registerAsync` in {@link GameSessionModule}. Three deliberate
 * edges (recon M3/M4/M5):
 *
 *   - `memoryStorage()` — the bytes reach the use case as a `Buffer`; the use
 *     case streams them to MinIO OUTSIDE any transaction (the two-phase upload).
 *   - `limits.fileSize` — the authoritative 25 MB (configurable) ceiling. Multer
 *     aborts an over-size stream itself and Nest's `transformException` renders
 *     the resulting `LIMIT_FILE_SIZE` as a 413, so NO custom exception filter is
 *     needed (a `MulterExceptionFilter` would be dead code).
 *   - `fileFilter` — an EXTENSION-only allowlist check (there is only an
 *     extension allowlist, not a MIME one; comparing the client MIME would break
 *     the happy path). A rejection raises a `BadRequestException` (→ 400), NEVER
 *     a bare `Error` (which Nest would surface as a 500).
 *
 * The filter is a fast pre-screen; the use case RE-derives and RE-validates the
 * extension (and pins the canonical MIME) as the authoritative, transport-free
 * guard.
 */
export function presentationMulterOptions(
  config: AppConfigService,
): MulterModuleOptions {
  const allowed = config.fileLimits.allowedPresentationFormats;
  return {
    storage: memoryStorage(),
    limits: { fileSize: config.fileLimits.maxFileSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      const lastDot = file.originalname.lastIndexOf('.');
      const extension =
        lastDot < 0 ? '' : file.originalname.slice(lastDot + 1).toLowerCase();
      if (allowed.includes(extension)) {
        callback(null, true);
      } else {
        callback(
          new BadRequestException('Unsupported presentation file format.'),
          false,
        );
      }
    },
  };
}
