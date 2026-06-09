// Application layer for game-session.
//
// Sub-stage 5.1 exposes only the transactional boundary port. Lobby use cases
// (CreateRoom, JoinRoom, CreateTeam, SelectTopic, MarkTeamReady, StartGame, …)
// and the TransactionPort adapter arrive in sub-stage 5.2.
export * from './ports';
