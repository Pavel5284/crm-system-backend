import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

// Дефолтная защита всего API: NUL-байт не легитимен ни в одном поле
// (PostgreSQL тип text его не хранит — будет 500-я), поэтому отклоняем
// такой запрос до контроллера. Полный диапазон управляющих символов
// здесь НЕ баним: переводы строк легитимны в многострочных полях
// (чат, комментарии, описания) — для однострочных полей стоят
// точечные @Matches-guard'ы в DTO.
const NULL_BYTE = String.fromCharCode(0);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function containsNullByte(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(NULL_BYTE);
  if (Array.isArray(value)) return value.some(containsNullByte);
  if (isPlainObject(value)) return Object.values(value).some(containsNullByte);
  return false;
}

@Injectable()
export class RejectNullBytesInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      body?: unknown;
      query?: unknown;
    }>();
    if (containsNullByte(req.body) || containsNullByte(req.query)) {
      throw new BadRequestException('Недопустимые символы в запросе');
    }
    return next.handle();
  }
}
