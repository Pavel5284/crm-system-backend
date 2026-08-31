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

  @ApiPropertyOptional({
    description:
      'Base64 data URI (data:image/png;base64,...) или пустая строка для дефолтной аватары',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(7_000_000)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Реклама' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromSource?: string | null;
}
