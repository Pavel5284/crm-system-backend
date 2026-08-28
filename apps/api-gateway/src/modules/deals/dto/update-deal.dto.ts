import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { DEAL_STATUSES } from './create-deal.dto';

export class UpdateDealDto {
  @ApiProperty({ enum: DEAL_STATUSES })
  @IsIn(DEAL_STATUSES)
  status: string;
}
