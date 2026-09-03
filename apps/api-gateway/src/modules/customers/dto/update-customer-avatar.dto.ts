import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerAvatarDto {
  @ApiPropertyOptional({
    description: 'Base64 data URI (data:image/png;base64,...)',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(7_000_000)
  avatarUrl?: string;
}
