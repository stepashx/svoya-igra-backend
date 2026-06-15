import { ShopItem } from '../../../commerce/domain/entities';
import { PresentationSubmission } from '../../../presentation/domain/entities';
import {
  PresentationTimerState,
  ShopTimerState,
} from '../../application/timers';
import {
  FIXED_NOW,
  makePlayer,
  makeRoom,
  makeTeam,
  makeTopic,
} from '../../application/use-cases/lobby-test-doubles';
import {
  toCreateRoomResponse,
  toPlayerIdentityResponse,
  toPlayerResponse,
  toPresentationDeadlineResponse,
  toPresentationFileResponse,
  toPresentationSubmissionStatusResponse,
  toPresentationUploadResultResponse,
  toRoomResponse,
  toRoomStateResponse,
  toShopItemResponse,
  toShopRoundResponse,
  toShopTimerResponse,
  toTeamResponse,
  toTopicResponse,
} from './index';

describe('presentation mappers', () => {
  it('maps a room without leaking the host token; dates become ISO strings', () => {
    const dto = toRoomResponse(makeRoom());
    expect(dto.code).toBe('ABCDEF');
    expect(dto.createdAt).toBe('2026-06-09T12:00:00.000Z');
    expect(dto.finishedAt).toBeNull();
    expect(dto).not.toHaveProperty('hostReconnectToken');
  });

  it('exposes the host token only on the create-room response', () => {
    const dto = toCreateRoomResponse(makeRoom());
    expect(dto.hostId).toBe('host-1');
    expect(dto.hostReconnectToken).toBe('host-token');
    expect(dto.room).not.toHaveProperty('hostReconnectToken');
  });

  it('maps a player without leaking the reconnect token', () => {
    const dto = toPlayerResponse(makePlayer({ isCaptain: true }));
    expect(dto.name).toBe('Ann');
    expect(dto.isCaptain).toBe(true);
    expect(dto).not.toHaveProperty('reconnectToken');
  });

  it('exposes the reconnect token only on the identity response', () => {
    const dto = toPlayerIdentityResponse(makePlayer());
    expect(dto.reconnectToken).toBe('player-token');
    expect(dto.player).not.toHaveProperty('reconnectToken');
  });

  it('unwraps team score value objects to primitives', () => {
    const dto = toTeamResponse(makeTeam({ turnOrder: 2 }));
    expect(dto.earnedScore).toBe(0);
    expect(dto.balance).toBe(0);
    expect(dto.turnOrder).toBe(2);
  });

  it('maps a topic and a full room-state snapshot', () => {
    expect(toTopicResponse(makeTopic('t1', 'History'))).toEqual({
      id: 't1',
      title: 'History',
      description: null,
    });
    const state = toRoomStateResponse({
      room: makeRoom(),
      players: [makePlayer(), makePlayer({ id: 'p2' })],
      teams: [makeTeam()],
    });
    expect(state.players).toHaveLength(2);
    expect(state.teams).toHaveLength(1);
    expect(state.room.code).toBe('ABCDEF');
  });

  describe('shop mappers (8.2)', () => {
    const runningTimer: ShopTimerState = {
      status: 'RUNNING',
      startedAt: new Date('2026-06-10T12:00:00.000Z'),
      endsAt: new Date('2026-06-10T12:02:00.000Z'),
      minClosableAt: new Date('2026-06-10T12:00:30.000Z'),
      remainingMs: 120_000,
      closable: false,
    };

    it('maps a catalog entry with its availability, qrToolId only (no URL)', () => {
      const dto = toShopItemResponse({
        item: ShopItem.reconstitute({
          id: 'item-1',
          title: 'Товар 1',
          description: 'Описание',
          price: 100,
          qrToolId: 'qr-1',
          createdAt: FIXED_NOW,
        }),
        available: false,
      });
      expect(dto).toEqual({
        id: 'item-1',
        title: 'Товар 1',
        description: 'Описание',
        price: 100,
        qrToolId: 'qr-1',
        available: false,
      });
      expect(dto).not.toHaveProperty('publicUrl');
    });

    it('renders RUNNING shop-timer stamps as ISO strings with closable', () => {
      expect(toShopTimerResponse(runningTimer)).toEqual({
        status: 'RUNNING',
        startedAt: '2026-06-10T12:00:00.000Z',
        endsAt: '2026-06-10T12:02:00.000Z',
        minClosableAt: '2026-06-10T12:00:30.000Z',
        remainingMs: 120_000,
        closable: false,
      });
    });

    it('renders IDLE shop timer with null stamps and closable true', () => {
      expect(
        toShopTimerResponse({
          status: 'IDLE',
          startedAt: null,
          endsAt: null,
          minClosableAt: null,
          remainingMs: 0,
          closable: true,
        }),
      ).toEqual({
        status: 'IDLE',
        startedAt: null,
        endsAt: null,
        minClosableAt: null,
        remainingMs: 0,
        closable: true,
      });
    });

    it('maps the shop round with derived finality', () => {
      const regular = toShopRoundResponse(
        makeRoom({
          currentStage: 'SHOP',
          blockedQuestionsCount: 6,
          currentShopRound: 1,
        }),
        runningTimer,
      );
      expect(regular.currentShopRound).toBe(1);
      expect(regular.currentStage).toBe('SHOP');
      expect(regular.isFinalShop).toBe(false);
      expect(regular.timer.status).toBe('RUNNING');

      const final = toShopRoundResponse(
        makeRoom({
          currentStage: 'SHOP',
          blockedQuestionsCount: 30,
          currentShopRound: 5,
        }),
        runningTimer,
      );
      expect(final.isFinalShop).toBe(true);
    });
  });

  describe('presentation mappers (9.2)', () => {
    it('renders a RUNNING preparation deadline with ISO stamps', () => {
      const timer: PresentationTimerState = {
        status: 'RUNNING',
        startedAt: new Date('2026-06-14T12:00:00.000Z'),
        endsAt: new Date('2026-06-14T12:10:00.000Z'),
        remainingMs: 600_000,
      };
      expect(toPresentationDeadlineResponse(timer)).toEqual({
        status: 'RUNNING',
        startedAt: '2026-06-14T12:00:00.000Z',
        endsAt: '2026-06-14T12:10:00.000Z',
        remainingMs: 600_000,
      });
    });

    it('renders an IDLE preparation deadline with null stamps', () => {
      expect(
        toPresentationDeadlineResponse({
          status: 'IDLE',
          startedAt: null,
          endsAt: null,
          remainingMs: 0,
        }),
      ).toEqual({
        status: 'IDLE',
        startedAt: null,
        endsAt: null,
        remainingMs: 0,
      });
    });

    it('maps a submission to its public status DTO (publicUrl included, §10.15)', () => {
      const uploadedAt = new Date('2026-06-14T12:05:00.000Z');
      const dto = toPresentationSubmissionStatusResponse(
        PresentationSubmission.reconstitute({
          id: 'sub-1',
          roomId: 'room-1',
          teamId: 'team-1',
          uploadedByPlayerId: 'player-1',
          originalFileName: 'deck.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          storageProvider: 'minio',
          bucket: 'presentations',
          storageKey: 'room-1/team-1.pdf',
          publicUrl: 'https://cdn.example/room-1/team-1.pdf',
          uploadedAt,
          deadlineAt: new Date('2026-06-14T12:10:00.000Z'),
          isLate: true,
          latePenalty: 5,
          status: 'LATE',
        }),
      );
      expect(dto).toEqual({
        teamId: 'team-1',
        status: 'LATE',
        isLate: true,
        uploadedAt: uploadedAt.toISOString(),
        publicUrl: 'https://cdn.example/room-1/team-1.pdf',
        originalFileName: 'deck.pdf',
        fileSize: 2048,
        latePenalty: 5,
      });
    });

    const submissionFixture = () => {
      const uploadedAt = new Date('2026-06-14T12:05:00.000Z');
      return PresentationSubmission.reconstitute({
        id: 'sub-1',
        roomId: 'room-1',
        teamId: 'team-1',
        uploadedByPlayerId: 'player-1',
        originalFileName: 'deck.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        storageProvider: 'minio',
        bucket: 'presentations',
        storageKey: 'room-1/team-1.pdf',
        publicUrl: 'https://cdn.example/room-1/team-1.pdf',
        uploadedAt,
        deadlineAt: new Date('2026-06-14T12:10:00.000Z'),
        isLate: false,
        latePenalty: 0,
        status: 'UPLOADED',
      });
    };

    it('maps a submission to its public file DTO (§10.15)', () => {
      const dto = toPresentationFileResponse(submissionFixture());
      expect(dto).toEqual({
        teamId: 'team-1',
        originalFileName: 'deck.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        publicUrl: 'https://cdn.example/room-1/team-1.pdf',
        status: 'UPLOADED',
        isLate: false,
        uploadedAt: '2026-06-14T12:05:00.000Z',
      });
    });

    it('maps the upload use-case result to the flat captain reply', () => {
      const submission = submissionFixture();
      const dto = toPresentationUploadResultResponse({
        submission,
        publicUrl: submission.publicUrl,
        isCreate: true,
      });
      expect(dto).toEqual({
        isCreate: true,
        teamId: 'team-1',
        originalFileName: 'deck.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        status: 'UPLOADED',
        isLate: false,
        latePenalty: 0,
        uploadedAt: '2026-06-14T12:05:00.000Z',
        publicUrl: 'https://cdn.example/room-1/team-1.pdf',
      });
    });
  });
});
