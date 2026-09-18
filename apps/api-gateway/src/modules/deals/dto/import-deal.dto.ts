import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn, IsUUID } from 'class-validator';
import { CreateDealDto, DEAL_STATUSES } from './create-deal.dto';

export class ImportDealDto extends CreateDealDto {
  @ApiProperty({
    enum: DEAL_STATUSES,
    example: 'in-progress',
    description: 'Этап, на который вносится сделка при импорте',
  })
  @IsIn(DEAL_STATUSES)
  status: string;

  @ApiProperty({
    example: true,
    description: 'При импорте всегда true',
  })
  @Equals(true)
  isImported: true;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Пользователь, от имени которого внесена сделка',
  })
  @IsUUID()
  importedBy: string;
}
