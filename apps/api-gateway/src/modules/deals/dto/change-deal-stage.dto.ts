import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { DEAL_STATUSES, TrimString } from './create-deal.dto';

export class ChangeDealStageDto {
  @ApiProperty({
    enum: DEAL_STATUSES,
    example: 'to-be-agreed',
    description: 'Целевой этап сделки',
  })
  @IsIn(DEAL_STATUSES)
  targetStage: string;

  @ApiProperty({
    example: 'Согласовано с клиентом по телефону',
    description:
      'Обязательный комментарий к переходу, сохраняется в deal_stage_history',
  })
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  comment: string;
}
