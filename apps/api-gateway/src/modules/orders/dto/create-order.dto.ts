import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateOrderItemDto {
  @ApiProperty({ example: 'Насос ЦНС 38-44' })
  @IsString()
  @MaxLength(300)
  name: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity: number = 1;

  @ApiPropertyOptional({ example: 'шт' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiProperty({ example: 75000, description: 'Цена за единицу' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'Комплектация с двигателем 15 кВт' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  spec?: string;
}

export class CreateOrderDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Сделка-источник: клиент, сумма и позиции подтягиваются из неё. ' +
      'Либо dealId, либо customerId (ровно один).',
  })
  @IsOptional()
  @IsUUID()
  dealId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Клиент для ручного заказа (без привязки к сделке).',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    example: 150000,
    description:
      'Итог заказа. Если переданы items и total не указан — считается как ' +
      'sum(price * quantity). Явный total имеет приоритет (скидка/наценка).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  total?: number;

  @ApiPropertyOptional({ example: 'Счёт на предоплату 50%' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ type: [CreateOrderItemDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];
}
