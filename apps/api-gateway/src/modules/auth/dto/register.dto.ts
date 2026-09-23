import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Alice' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
