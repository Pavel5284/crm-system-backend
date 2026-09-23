import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  // Без MinLength (не раскрываем политику), но с верхним лимитом:
  // иначе гигантский пароль уходит в argon2 и кладет CPU.
  @MaxLength(128)
  password: string;
}
