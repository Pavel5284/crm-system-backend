import { NestFactory } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { QUEUES } from '@app/shared';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
      queue: QUEUES.GATEWAY_EVENTS,
      queueOptions: { durable: true },
    },
  });

  app.use(helmet());
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );
  app.useLogger(app.get(Logger));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Task Manager API')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  await app.startAllMicroservices();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 api-gateway: http://localhost:${port}/api`);
}

void bootstrap();
