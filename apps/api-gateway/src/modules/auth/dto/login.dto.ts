import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ASCII_EMAIL_MESSAGE, ASCII_EMAIL_PATTERN } from '@app/shared';

const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @Matches(ASCII_EMAIL_PATTERN, { message: ASCII_EMAIL_MESSAGE })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  // Без MinLength (не раскрываем политику), но с верхним лимитом:
  // иначе гигантский пароль уходит в argon2 и кладет CPU.
  @MaxLength(128)
  // Только печатный ASCII: латиница, цифры и символы.
  @Matches(/^[ -~]*$/, {
    message: 'Используйте только английские буквы, цифры и символы',
  })
  password: string;
}
