import { ApiProperty } from '@nestjs/swagger';

/** Public view of a board category. */
export class CategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  position!: number;
}

/**
 * Public view of a board cell. Carries the lifecycle state and actor links but
 * NEVER the question text or its answer — those live behind the question
 * endpoints (and the answer behind the host guard).
 */
export class CellResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  points!: number;

  @ApiProperty()
  position!: number;

  @ApiProperty({ enum: ['AVAILABLE', 'SELECTED', 'OPENED', 'BLOCKED'] })
  state!: string;

  @ApiProperty({ nullable: true })
  openedByTeamId!: string | null;

  @ApiProperty({ nullable: true })
  answeredByTeamId!: string | null;
}

/** The full board: the global categories and the room's cells. */
export class BoardResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  categories!: CategoryResponseDto[];

  @ApiProperty({ type: [CellResponseDto] })
  cells!: CellResponseDto[];
}
