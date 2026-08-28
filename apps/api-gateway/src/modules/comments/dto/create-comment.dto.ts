import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dealId: string;

  @ApiProperty({ example: 'Обсудили условия поставки' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}
