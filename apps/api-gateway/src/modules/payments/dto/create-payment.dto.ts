import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ example: 75000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.TRANSFER })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    description:
      'Начальный статус: PENDING (по умолчанию) или SUCCEEDED для быстрой проводки.',
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ example: 'Предоплата 50% по счёту №12' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
