import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DealPriority } from '@prisma/client';
import { TrimString } from './create-deal.dto';

// Stage сделки здесь отсутствует намеренно: смена stage — только через
// PATCH /deals/:id/stage (state machine по stage_transition_rules).
// Компания/контакты/источник живут на клиенте (PATCH /customers/:id),
// в сделке правятся только её собственные поля.
export class UpdateDealDto {
  @ApiPropertyOptional({
    example: 'Поставка 10 насосов, монтаж и пусконаладка',
  })
  @IsOptional()
  @TrimString()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ enum: DealPriority })
  @IsOptional()
  @IsEnum(DealPriority)
  priority?: DealPriority;
}
