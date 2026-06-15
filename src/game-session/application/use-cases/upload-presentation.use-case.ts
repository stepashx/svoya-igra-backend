import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  FILE_STORAGE_PORT,
  FileStoragePort,
} from '../../../core/ports/file-storage.port';
import {
  ID_GENERATOR_PORT,
  IdGeneratorPort,
} from '../../../core/ports/id-generator.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { AppConfigService } from '../../../config/app-config.service';
import { canonicalMime } from '../../../infrastructure/storage/storage.constants';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { PresentationSubmission } from '../../../presentation/domain/entities';
import {
  PRESENTATION_SUBMISSION_REPOSITORY_PORT,
  PresentationSubmissionRepositoryPort,
} from '../../../presentation/domain/ports';
import {
  NotTeamCaptainError,
  PreparationNotStartedError,
  RoomNotActiveError,
  RoomNotFoundError,
  UnsupportedPresentationFormatError,
} from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import {
  PresentationEvent,
  presentationFileSummary,
  presentationUploadSummary,
} from '../events';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { PresentationTimerRegistry } from '../timers';

/** The decoded multipart file the controller hands the use case. */
export interface UploadPresentationFile {
  originalFileName: string;
  /** Client-declared MIME — captured but DELIBERATELY NOT stored (see below). */
  mimeType: string;
  fileSize: number;
  buffer: Buffer;
}

export interface UploadPresentationInput {
  roomId: string;
  actingPlayerId: string;
  file: UploadPresentationFile;
}

/** The persisted submission, its public link, and whether this was a first upload. */
export interface UploadPresentationResult {
  submission: PresentationSubmission;
  publicUrl: string;
  isCreate: boolean;
}

/**
 * A team captain uploads (or replaces) their team's presentation file during
 * PRESENTATION_PREPARATION (plan §14.9, §15.10) — the project's first runtime
 * file upload. Captain-authz mirrors {@link PurchaseItemUseCase}: the receiver
 * is the actor's OWN team (`player.teamId`), so the check is team captaincy, not
 * the room's turn-holder ({@link NotTeamCaptainError}). POST (first) and PUT
 * (replace) are ONE use case (upsert): on a re-upload the existing submission id
 * is reused, so the row is overwritten in place and the stored object key is the
 * same (same-extension re-uploads leave no orphan).
 *
 * TWO-PHASE by design (recon M1 — pool exhaustion). The per-room lock is a
 * `pg_advisory_xact_lock`, held for the WHOLE transaction, and the pool is the
 * default 10 connections. Streaming a 25 MB file to MinIO while holding a lock
 * AND a connection would let ~10 concurrent uploads from DIFFERENT rooms drain
 * the pool and stall the app. So:
 *
 *   - Phase 1 (no tx, no lock): validate format, resolve room/captain/timer,
 *     read the deadline, and resolve the submission id (reuse-on-replace).
 *   - Phase 2 (no tx, no lock): stream the bytes to {@link FileStoragePort}.
 *   - Phase 3 (short tx + lock): re-check the stage (it may have advanced during
 *     the upload), re-read the submission authoritatively to decide
 *     create-vs-replace, persist the row + the team link, and snapshot the
 *     catalog. The lock is held only for the cheap DB work, never the upload.
 *
 * Stored-XSS guard (recon B2): the stored `mimeType` is the SERVER-canonical
 * MIME derived from the file EXTENSION ({@link canonicalMime}), NEVER the client
 * `mimetype` — the bucket is public-read, so a `.pdf` full of HTML must not be
 * served as `text/html`. Path-injection guard (recon C): the extension is
 * re-derived from the original name and re-validated against the allowlist
 * BEFORE it reaches the storage key, so only `pdf`/`ppt`/`pptx` ever appear in
 * the key — the raw filename never does.
 *
 * Broadcasts (all room-wide and PUBLIC — §10.15, the opposite of §16.5): they
 * fire AFTER commit (like 8.3 `inventory-updated`) because they carry the
 * `publicUrl` of a now-durable row — `submission-uploaded` OR
 * `submission-replaced`, then `submission-late` (iff late), then `files-updated`
 * (the whole catalog) LAST. `submission-status-changed` is intentionally NOT
 * emitted: the status is fixed once at create (a replace is a fresh create), so
 * there is no UPLOADED⟷LATE transition to announce (docs §16.6: Superseded).
 */
@Injectable()
export class UploadPresentationUseCase {
  constructor(
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(PRESENTATION_SUBMISSION_REPOSITORY_PORT)
    private readonly submissions: PresentationSubmissionRepositoryPort,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    private readonly presentationTimer: PresentationTimerRegistry,
    private readonly config: AppConfigService,
  ) {}

  async execute(
    input: UploadPresentationInput,
  ): Promise<UploadPresentationResult> {
    const now = this.clock.now();
    const { originalFileName, fileSize, buffer } = input.file;

    // Extension from the ORIGINAL name (after the last dot, lowercased) and
    // re-validated against the allowlist — defensive after the Multer filter,
    // and the guard that keeps a path-injected name out of the storage key.
    const extension = this.extensionOf(originalFileName);
    if (
      !this.config.fileLimits.allowedPresentationFormats.includes(extension)
    ) {
      throw new UnsupportedPresentationFormatError();
    }
    // SERVER-canonical MIME from the extension — NEVER the client mimetype.
    const safeContentType = canonicalMime(extension);

    // ---- Phase 1: validate + resolve (NO transaction, NO lock). ----------
    const room = await this.rooms.findById(input.roomId);
    if (!room) {
      throw new RoomNotFoundError();
    }
    if (room.status !== 'ACTIVE') {
      throw new RoomNotActiveError();
    }
    if (room.currentStage !== 'PRESENTATION_PREPARATION') {
      throw new UnexpectedGameStageError();
    }

    // Captain-authz on the ACTOR's OWN team (not the turn-holder): the uploader
    // must be the captain of the team the file belongs to.
    const player = await this.players.findById(input.actingPlayerId);
    if (!player || !player.teamId) {
      throw new NotTeamCaptainError();
    }
    const team = await this.teams.findById(player.teamId);
    if (!team || team.captainPlayerId !== input.actingPlayerId) {
      throw new NotTeamCaptainError();
    }

    // The deadline comes from the in-memory preparation timer. IDLE (or a null
    // deadline) means the host never opened preparation → no window to score
    // against (D4a). RUNNING is on-time; EXPIRED is late-with-penalty.
    const timer = this.presentationTimer.read(room.id, now);
    if (timer.status === 'IDLE' || timer.endsAt === null) {
      throw new PreparationNotStartedError();
    }
    const deadlineAt = timer.endsAt;

    // Resolve the submission id BEFORE the upload so a same-extension replace
    // overwrites the same object key (no orphan); a fresh id on first upload.
    const existing = await this.submissions.findByRoomAndTeam(room.id, team.id);
    const submissionId = existing ? existing.id : this.ids.generate();

    // ---- Phase 2: stream bytes to storage (NO transaction, NO lock). ------
    const locator = await this.fileStorage.putPresentation({
      roomId: room.id,
      teamId: team.id,
      submissionId,
      extension,
      body: buffer,
      size: fileSize,
      contentType: safeContentType,
    });

    // ---- Phase 3: persist under the per-room lock (short transaction). ----
    const committed = await this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      // Re-check the stage: it may have advanced while the bytes uploaded.
      const lockedRoom = await this.rooms.findById(input.roomId);
      if (!lockedRoom) {
        throw new RoomNotFoundError();
      }
      if (lockedRoom.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (lockedRoom.currentStage !== 'PRESENTATION_PREPARATION') {
        throw new UnexpectedGameStageError();
      }

      // Authoritative create-vs-replace decision (re-read under the lock).
      const current = await this.submissions.findByRoomAndTeam(
        lockedRoom.id,
        team.id,
      );

      const submission = PresentationSubmission.create(
        {
          id: current ? current.id : submissionId,
          roomId: lockedRoom.id,
          teamId: team.id,
          uploadedByPlayerId: input.actingPlayerId,
          originalFileName,
          // Stored MIME is the canonical server type (B2), not the client one.
          mimeType: safeContentType,
          fileSize,
          storageProvider: locator.storageProvider,
          bucket: locator.bucket,
          storageKey: locator.storageKey,
          publicUrl: locator.publicUrl,
          deadlineAt,
          latePenalty: this.config.fileLimits.latePenalty,
        },
        now,
      );

      if (current) {
        // UPDATE in place — keyed on the (room, team) unique index.
        await this.submissions.replace(submission);
      } else {
        // First write — `create` translates a 23505 into a clean 409 (the lock
        // makes a real concurrent insert unreachable; this is the arbiter).
        await this.submissions.create(submission);
      }

      // Re-read the team under the lock before mutating so a concurrent change
      // is never clobbered by a stale write (teams.update writes all columns).
      const lockedTeam = await this.teams.findById(team.id);
      if (!lockedTeam) {
        throw new NotTeamCaptainError();
      }
      lockedTeam.attachSubmission(submission.id);
      await this.teams.update(lockedTeam);

      // Snapshot the catalog in-tx so `files-updated` reflects this write.
      const catalog = await this.submissions.findByRoomId(lockedRoom.id);

      return {
        roomId: lockedRoom.id,
        teamId: team.id,
        submission,
        isCreate: current === null,
        catalog,
      };
    });

    // ---- AFTER commit: room-wide, public, publicUrl-bearing broadcasts. ---
    this.realtime.emitToRoom(
      committed.roomId,
      committed.isCreate
        ? PresentationEvent.SubmissionUploaded
        : PresentationEvent.SubmissionReplaced,
      {
        roomId: committed.roomId,
        teamId: committed.teamId,
        submission: presentationUploadSummary(committed.submission),
      },
    );
    if (committed.submission.isLate) {
      this.realtime.emitToRoom(
        committed.roomId,
        PresentationEvent.SubmissionLate,
        {
          roomId: committed.roomId,
          teamId: committed.teamId,
          submissionId: committed.submission.id,
          latePenalty: committed.submission.latePenalty,
        },
      );
    }
    // The whole catalog LAST.
    this.realtime.emitToRoom(committed.roomId, PresentationEvent.FilesUpdated, {
      roomId: committed.roomId,
      files: committed.catalog.map(presentationFileSummary),
    });

    return {
      submission: committed.submission,
      publicUrl: committed.submission.publicUrl,
      isCreate: committed.isCreate,
    };
  }

  /** Lowercased token after the LAST dot, or `''` when the name has no dot. */
  private extensionOf(originalFileName: string): string {
    const lastDot = originalFileName.lastIndexOf('.');
    if (lastDot < 0) {
      return '';
    }
    return originalFileName.slice(lastDot + 1).toLowerCase();
  }
}
