import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaymentStatus } from '@prisma/client';

export class ChangePaymentStatusDto {
  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.SUCCEEDED })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @ApiPropertyOptional({ example: 'Деньги поступили на счёт' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
