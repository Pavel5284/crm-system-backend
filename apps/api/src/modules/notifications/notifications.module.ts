import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TaskEventsListener } from './task-events.listener';

@Module({
    imports: [JwtModule.register({})],
    controllers: [NotificationsController],
    providers: [NotificationsGateway, NotificationsService, TaskEventsListener],
    exports: [NotificationsService],
})
export class NotificationsModule {}