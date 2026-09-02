import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAvatarDto {
  @ApiPropertyOptional({
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    description: 'base64 dataURL или https url, null для удаления',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000000)
  avatarUrl?: string | null;
}
