import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MarkMessagesReadDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'ID самого нижнего увиденного входящего сообщения — прочитанными станут все входящие от его автора вплоть до него',
  })
  @IsUUID()
  upToMessageId!: string;
}
