import { HttpException, HttpStatus } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom, timeout, TimeoutError } from "rxjs";

// Free-план (Render) усыпляет микросервисы: очередь RMQ их не будит,
// поэтому ответ может не прийти никогда. Без таймаута HTTP висел бы
// вечно (фронт — вечный pending). Fail fast: 15с → 504, фронт покажет
// ошибку с кнопкой повтора вместо бесконечной загрузки.
const RPC_TIMEOUT_MS = 15_000;

export async function sendRpc<TResult = unknown>(
  client: ClientProxy,
  pattern: string,
  payload: unknown,
): Promise<TResult> {
  try {
    return await firstValueFrom(
      client.send<TResult>(pattern, payload).pipe(timeout(RPC_TIMEOUT_MS)),
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new HttpException(
        "Сервис временно недоступен (засыпание free-плана), попробуйте позже",
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
    const rpcError = error as {
      statusCode?: number;
      status?: number;
      message?: string;
    };
    const statusCode = rpcError?.statusCode ?? rpcError?.status ?? 500;
    const message = rpcError?.message ?? "Внутренняя ошибка микросервиса";
    throw new HttpException(message, statusCode);
  }
}
