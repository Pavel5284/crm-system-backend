import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '@app/database';
import { HealthModule } from '@app/shared';
import { validateEnv } from './config/env.validation';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { LoggerModule } from 'nestjs-pino';
import {ThrottlerGuard, ThrottlerModule} from "@nestjs/throttler";

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        DatabaseModule,
        HealthModule,
        AuthModule,
        UsersModule,
        TasksModule,
        NotificationsModule,
        LoggerModule.forRoot({
            pinoHttp: {
                level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
                transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
                redact: ['req.headers.authorization'], // не логируем сами токены
            },
        }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // по умолчанию 100 запросов в минуту на IP
    ],
    providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
})
export class AppModule {}