import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

// Полная замена состава ответственных сделки (PATCH /deals/:id/responsibles).
// Первый id в массиве становится главным (responsibleUserId).
// Пустой массив снимает всех ответственных.
export class UpdateResponsiblesDto {
  @ApiProperty({
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    description: 'ID пользователей-ответственных, первый = главный',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(20)
  userIds: string[];
}
