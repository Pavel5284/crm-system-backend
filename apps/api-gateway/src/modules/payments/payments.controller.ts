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
import * as shared from '@app/shared';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ChangePaymentStatusDto } from './dto/change-payment-status.dto';
import { FindPaymentsQueryDto } from './dto/find-payments.query';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@Query() query: FindPaymentsQueryDto) {
    return this.paymentsService.findAll(query);
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
    @Body() dto: RefundPaymentDto,
    @CurrentUser() user: shared.AuthUser,
  ) {
    return this.paymentsService.refund(id, user.id, dto.comment);
  }

  @Delete(':id')
  @Roles(...shared.PAYMENT_PERMISSIONS.PAYMENTS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.paymentsService.remove(id);
  }
}
