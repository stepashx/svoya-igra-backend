import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Body for POST /rooms/:code/board/select (active team captain picks a cell). */
export class SelectCellRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Board cell id to select.' })
  @IsUUID()
  cellId!: string;
}
