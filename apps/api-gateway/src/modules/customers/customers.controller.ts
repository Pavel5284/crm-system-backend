import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCustomerAvatarDto } from './dto/update-customer-avatar.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, dto);
  }

  @Post(':id/avatar')
  uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerAvatarDto,
  ) {
    if (!dto.avatarUrl || !dto.avatarUrl.trim()) {
      throw new Error('avatarUrl required');
    }
    return this.customersService.updateAvatar(id, dto.avatarUrl.trim());
  }

  @Delete(':id/avatar')
  deleteAvatar(@Param('id', ParseUUIDPipe) id: string) {
    return this.customersService.deleteAvatar(id);
  }
}
