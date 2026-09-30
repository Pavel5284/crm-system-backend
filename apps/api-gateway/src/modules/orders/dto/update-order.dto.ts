import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CreateOrderItemDto } from './create-order.dto';

export class UpdateOrderDto {
  @ApiPropertyOptional({ example: 'Согласована скидка 5%' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({
    example: 142500,
    description:
      'Новый итог (только DRAFT/CONFIRMED, не ниже уже оплаченной суммы).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total?: number;

  @ApiPropertyOptional({
    type: [CreateOrderItemDto],
    description: 'Полная замена позиций (только DRAFT/CONFIRMED).',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];
}
