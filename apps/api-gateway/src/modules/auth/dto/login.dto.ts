import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @NormalizeEmail()
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
