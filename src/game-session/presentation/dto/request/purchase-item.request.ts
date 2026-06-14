import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Body for POST /rooms/:code/shop/purchase (a team captain buys an item). */
export class PurchaseItemRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Shop item id to purchase.' })
  @IsUUID()
  shopItemId!: string;
}
