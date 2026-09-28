import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Email храним в нижнем регистре без пробелов: Test@x.com и test@x.com —
// один аккаунт. Работает при transform: true в global ValidationPipe.
const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  // Только печатный ASCII: латиница, цифры и символы.
  @Matches(/^[ -~]*$/, {
    message: 'Используйте только английские буквы, цифры и символы',
  })
  password: string;

  @ApiProperty({ example: 'Alice' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  // Без управляющих символов: переносы строк и NUL-байты в однострочном
  // имени ломают логи и хранилище.
  // eslint-disable-next-line no-control-regex -- guard намеренно ищет управляющие символы.
  @Matches(/^[^\x00-\x1F\x7F]*$/, {
    message:
      'Недопустимые символы в имени. Допустимы буквы, цифры, пробелы и знаки препинания',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Токен Cloudflare Turnstile. Обязателен в проде.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}
