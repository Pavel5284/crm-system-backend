import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { TrimString } from './create-deal.dto';

// Главный комментарий сделки (PATCH /deals/:id/main-comment).
// Доступ — только ADMIN/MANAGER (см. `@Roles` на контроллере).
// Пустая строка очищает комментарий (сервис пишет NULL).
export class UpdateMainCommentDto {
  @ApiProperty({ example: 'Приоритетный клиент, держать в курсе еженедельно' })
  @TrimString()
  @IsString()
  @MaxLength(5000)
  comment: string;
}
