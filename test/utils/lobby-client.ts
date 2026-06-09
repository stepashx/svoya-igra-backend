import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  PlayerResponseDto,
  RoomStateResponseDto,
  TeamResponseDto,
  TopicResponseDto,
} from '../../src/game-session/presentation/dto/response';

export const PLAYER_HEADER = 'X-Player-Token';
export const HOST_HEADER = 'X-Host-Token';

const http = (app: INestApplication) => request(app.getHttpServer());

export interface CreatedRoom {
  code: string;
  hostId: string;
  hostToken: string;
}

export async function createRoom(app: INestApplication): Promise<CreatedRoom> {
  const res = await http(app).post('/api/rooms').expect(201);
  return {
    code: res.body.room.code,
    hostId: res.body.hostId,
    hostToken: res.body.hostReconnectToken,
  };
}

export interface JoinedPlayer {
  id: string;
  token: string;
}

export async function joinRoom(
  app: INestApplication,
  code: string,
  name: string,
): Promise<JoinedPlayer> {
  const res = await http(app)
    .post(`/api/rooms/${code}/players`)
    .send({ name })
    .expect(201);
  return { id: res.body.player.id, token: res.body.reconnectToken };
}

export async function createTeam(
  app: INestApplication,
  code: string,
  token: string,
  name: string,
): Promise<TeamResponseDto> {
  const res = await http(app)
    .post(`/api/rooms/${code}/teams`)
    .set(PLAYER_HEADER, token)
    .send({ name })
    .expect(201);
  return res.body;
}

export async function joinTeam(
  app: INestApplication,
  code: string,
  teamId: string,
  token: string,
): Promise<PlayerResponseDto> {
  const res = await http(app)
    .post(`/api/rooms/${code}/teams/${teamId}/members`)
    .set(PLAYER_HEADER, token)
    .expect(201);
  return res.body;
}

export async function selectTopic(
  app: INestApplication,
  code: string,
  teamId: string,
  token: string,
  topicId: string,
): Promise<TeamResponseDto> {
  const res = await http(app)
    .patch(`/api/rooms/${code}/teams/${teamId}/topic`)
    .set(PLAYER_HEADER, token)
    .send({ topicId })
    .expect(200);
  return res.body;
}

export async function setReady(
  app: INestApplication,
  code: string,
  teamId: string,
  token: string,
  isReady: boolean,
): Promise<TeamResponseDto> {
  const res = await http(app)
    .patch(`/api/rooms/${code}/teams/${teamId}/ready`)
    .set(PLAYER_HEADER, token)
    .send({ isReady })
    .expect(200);
  return res.body;
}

export async function startGame(
  app: INestApplication,
  code: string,
  hostToken: string,
): Promise<RoomStateResponseDto> {
  const res = await http(app)
    .post(`/api/rooms/${code}/game/start`)
    .set(HOST_HEADER, hostToken)
    .expect(200);
  return res.body;
}

export async function listTopics(
  app: INestApplication,
): Promise<TopicResponseDto[]> {
  const res = await http(app).get('/api/topics').expect(200);
  return res.body;
}
