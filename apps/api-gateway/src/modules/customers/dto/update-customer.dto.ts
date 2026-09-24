import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'ООО Ромашка' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'client@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+7 900 000-00-00' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Иван Петров' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string | null;

  // avatar — отдельный эндпоинт POST/DELETE /customers/:id/avatar

  @ApiPropertyOptional({ example: 'Реклама' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromSource?: string | null;
}
