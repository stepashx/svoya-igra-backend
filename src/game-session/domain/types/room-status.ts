/**
 * Room availability status (`Room.status`), declared as the domain's OWN union
 * literal — tracked separately from the game stage. Conformance with the schema
 * column is enforced by the mappers at compile time (see {@link GameStage}).
 */
export type RoomStatus = 'ACTIVE' | 'FINISHED' | 'CLOSED';
