import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Body referencing the active cell by id, used by the host open/reject routes
 * (POST /rooms/:code/questions/open and .../reject). The id must match the
 * room's current SELECTED cell or the use case rejects it.
 */
export class CellRefRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Active board cell id.' })
  @IsUUID()
  cellId!: string;
}
