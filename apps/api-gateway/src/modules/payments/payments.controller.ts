import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentStatus } from '@prisma/client';
import * as shared from '@app/shared';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ChangePaymentStatusDto } from './dto/change-payment-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(
    @Query('orderId') orderId?: string,
    @Query('status') status?: PaymentStatus,
  ) {
    return this.paymentsService.findAll({ orderId, status });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post()
  @Roles(...shared.PAYMENT_PERMISSIONS.PAYMENTS_CREATE)
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: shared.AuthUser) {
    return this.paymentsService.create(dto, user.id);
  }

  @Patch(':id/status')
  @Roles(...shared.PAYMENT_PERMISSIONS.PAYMENTS_UPDATE)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePaymentStatusDto,
    @CurrentUser() user: shared.AuthUser,
  ) {
    return this.paymentsService.changeStatus(id, dto, user.id);
  }

  @Post(':id/refund')
  @Roles(...shared.PAYMENT_PERMISSIONS.PAYMENTS_REFUND)
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { comment?: string } = {},
    @CurrentUser() user: shared.AuthUser,
  ) {
    return this.paymentsService.refund(id, user.id, body.comment);
  }

  @Delete(':id')
  @Roles(...shared.PAYMENT_PERMISSIONS.PAYMENTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.paymentsService.remove(id);
  }
}
