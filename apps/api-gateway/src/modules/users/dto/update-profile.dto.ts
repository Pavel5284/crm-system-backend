import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Alice Johnson' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Product Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  // avatar теперь отдельным эндпоинтом PATCH /users/profile/avatar

  @ApiPropertyOptional({ example: '+79991234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, { message: 'Неверный формат телефона' })
  phone?: string;

  @ApiPropertyOptional({ example: '@alice' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^@?[a-zA-Z0-9_]{3,32}$/, { message: 'Неверный формат Telegram' })
  telegram?: string;
}
