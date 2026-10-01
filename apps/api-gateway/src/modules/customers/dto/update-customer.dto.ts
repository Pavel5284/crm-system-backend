import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ASCII_EMAIL_MESSAGE, ASCII_EMAIL_PATTERN } from '@app/shared';

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'ООО Ромашка' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  // eslint-disable-next-line no-control-regex -- guard намеренно ищет управляющие символы.
  @Matches(/^[^\x00-\x1F\x7F]*$/, {
    message:
      'Недопустимые символы в имени. Допустимы буквы, цифры, пробелы и знаки препинания',
  })
  name?: string;

  @ApiPropertyOptional({ example: 'client@example.com' })
  @IsOptional()
  @IsEmail()
  @Matches(ASCII_EMAIL_PATTERN, { message: ASCII_EMAIL_MESSAGE })
  email?: string;

  @ApiPropertyOptional({ example: '+7 900 000-00-00' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  // eslint-disable-next-line no-control-regex -- guard намеренно ищет управляющие символы.
  @Matches(/^[^\x00-\x1F\x7F]*$/, { message: 'Неверный формат телефона' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Иван Петров' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  // eslint-disable-next-line no-control-regex -- guard намеренно ищет управляющие символы.
  @Matches(/^[^\x00-\x1F\x7F]*$/, {
    message:
      'Недопустимые символы в имени. Допустимы буквы, цифры, пробелы и знаки препинания',
  })
  contactPerson?: string | null;

  // avatar — отдельный эндпоинт POST/DELETE /customers/:id/avatar

  @ApiPropertyOptional({ example: 'Реклама' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  // eslint-disable-next-line no-control-regex -- guard намеренно ищет управляющие символы.
  @Matches(/^[^\x00-\x1F\x7F]*$/, {
    message:
      'Недопустимые символы в источнике. Допустимы буквы, цифры, пробелы и знаки препинания',
  })
  fromSource?: string | null;
}
