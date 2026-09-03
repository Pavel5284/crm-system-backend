import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Param,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '@app/shared';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('search')
  @ApiQuery({ name: 'q', required: true })
  search(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.chatService.searchUsers(user.id, q);
  }

  @Get('conversations')
  getConversations(@CurrentUser() user: AuthUser) {
    return this.chatService.getConversations(user.id);
  }

  @Get('messages/:partnerId')
  getMessages(
    @CurrentUser() user: AuthUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.chatService.getMessages(user.id, partnerId, limit, offset);
  }

  @Get('unread-count')
  getUnread(@CurrentUser() user: AuthUser) {
    return this.chatService.getUnreadCount(user.id);
  }

  @Post('messages')
  async send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    const message = await this.chatService.sendMessage(
      user,
      dto.receiverId,
      dto.text,
    );
    // realtime уведомляем получателя и отправителя (для мульти-табов)
    this.chatGateway.notifyNewMessage(dto.receiverId, message);
    this.chatGateway.sendToUser(user.id, 'chat:message', message);
    return message;
  }
}
