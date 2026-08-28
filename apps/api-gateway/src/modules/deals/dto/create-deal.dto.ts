import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const DEAL_STATUSES = [
  'todo',
  'to-be-agreed',
  'in-progress',
  'produced',
  'done',
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];

export class CreateDealDto {
  @ApiProperty({ example: 'Поставка оборудования' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 150000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 'client@example.com' })
  @IsEmail()
  customerEmail: string;

  @ApiProperty({ example: 'ООО Ромашка' })
  @IsString()
  @MaxLength(200)
  customerName: string;

  @ApiPropertyOptional({ enum: DEAL_STATUSES, default: 'todo' })
  @IsOptional()
  @IsIn(DEAL_STATUSES)
  status?: string;
}
