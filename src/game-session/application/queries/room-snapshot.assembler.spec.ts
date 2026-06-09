import {
  makePlayer,
  makePlayerRepo,
  makeRoom,
  makeTeam,
  makeTeamRepo,
} from '../use-cases/lobby-test-doubles';
import { RoomSnapshotAssembler } from './room-snapshot.assembler';

describe('RoomSnapshotAssembler', () => {
  it('loads the room with its players and teams', async () => {
    const players = makePlayerRepo();
    const teams = makeTeamRepo();
    players.findByRoomId.mockResolvedValue([makePlayer()]);
    teams.findByRoomId.mockResolvedValue([makeTeam()]);
    const assembler = new RoomSnapshotAssembler(players, teams);
    const room = makeRoom();

    const snapshot = await assembler.assemble(room);

    expect(snapshot.room).toBe(room);
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.teams).toHaveLength(1);
    expect(players.findByRoomId).toHaveBeenCalledWith('room-1');
    expect(teams.findByRoomId).toHaveBeenCalledWith('room-1');
  });
});
