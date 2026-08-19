import { HttpException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

export async function sendRpc<TResult = unknown>(
    client: ClientProxy,
    pattern: string,
    payload: unknown,
): Promise<TResult> {
    try {
        return await firstValueFrom(client.send<TResult>(pattern, payload));
    } catch (error: any) {
        const statusCode = error?.statusCode ?? error?.status ?? 500;
        const message = error?.message ?? 'Внутренняя ошибка микросервиса';
        throw new HttpException(message, statusCode);
    }
}