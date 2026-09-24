import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { DealPriority } from '@prisma/client';
import { DEAL_STAGES, DealStage } from '@app/shared';

export const DEAL_STATUSES = DEAL_STAGES;

export type DealStatus = DealStage;

// Обрезает пробелы до валидации: строки из одних пробелов не должны
// сохраняться как «заполненные» (Этап 5). Работает при transform: true
// в global ValidationPipe (см. main.ts).
export const TrimString = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

// Данные нового клиента прямо в форме сделки («Создать нового клиента»).
// Используется только когда не передан customerId.
export class NewCustomerDto {
  @ApiProperty({ example: 'ООО Ромашка' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'client@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+7 900 000-00-00' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'Иван Петров' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @ApiPropertyOptional({ example: 'site' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromSource?: string;
}

export class CreateDealDto {
  @ApiProperty({ example: 'Поставка оборудования' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'Поставка 10 насосов, монтаж и пусконаладка' })
  @TrimString()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @ApiProperty({ example: 150000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  // Клиент сделки: ровно один из двух вариантов (проверяет сервис).
  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Существующий клиент (выбор из списка)',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Новый клиент (создаётся вместе со сделкой)',
    type: NewCustomerDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewCustomerDto)
  newCustomer?: NewCustomerDto;

  // Единая точка входа (Этап 2): обычное создание всегда идёт на stage
  // по умолчанию ('todo' = «Входящие»). Поле status здесь отсутствует
  // намеренно: global ValidationPipe (whitelist + forbidNonWhitelisted)
  // отклонит запрос с произвольным stage кодом 400. Создание сразу на
  // произвольный этап — только через POST /deals/import (роль admin).

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Ответственный за сделку. Обязателен при создании (Этап 5).',
  })
  @IsUUID()
  responsibleUserId: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ enum: DealPriority, default: DealPriority.MEDIUM })
  @IsOptional()
  @IsEnum(DealPriority)
  priority?: DealPriority;
}
