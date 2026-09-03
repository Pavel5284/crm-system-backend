import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ format: 'uuid', description: 'ID получателя' })
  @IsUUID()
  receiverId!: string;

  @ApiProperty({ example: 'Привет! Как дела?' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;
}
