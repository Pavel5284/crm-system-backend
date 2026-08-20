import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import { NOTIFICATION_PATTERNS, sendRpc } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject('NOTIFICATIONS_SERVICE')
    private readonly notificationsClient: ClientProxy,
  ) {}

  @Get()
  findMine(@CurrentUser('id') userId: string) {
    return sendRpc(this.notificationsClient, NOTIFICATION_PATTERNS.FIND_MINE, {
      userId,
    });
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return sendRpc(this.notificationsClient, NOTIFICATION_PATTERNS.MARK_READ, {
      id,
      userId,
    });
  }
}
