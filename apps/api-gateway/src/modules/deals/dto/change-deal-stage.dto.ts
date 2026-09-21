import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DEAL_STATUSES, TrimString } from './create-deal.dto';

export class ChangeDealStageDto {
  @ApiProperty({
    enum: DEAL_STATUSES,
    example: 'to-be-agreed',
    description: 'Целевой этап сделки',
  })
  @IsIn(DEAL_STATUSES)
  targetStage: string;

  @ApiPropertyOptional({
    example: 'Согласовано с клиентом по телефону',
    description:
      'Необязательный комментарий к переходу, сохраняется в deal_stage_history',
  })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
