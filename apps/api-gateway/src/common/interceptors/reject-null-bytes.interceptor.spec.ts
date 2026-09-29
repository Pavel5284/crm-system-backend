import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { RejectNullBytesInterceptor } from './reject-null-bytes.interceptor';

const NUL = String.fromCharCode(0);
const LF = String.fromCharCode(10);

function contextWith(body: unknown, query: unknown = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body, query }) }),
  } as unknown as ExecutionContext;
}

function handler() {
  return { handle: jest.fn(() => of('ok')) } as unknown as CallHandler;
}

describe('RejectNullBytesInterceptor', () => {
  const interceptor = new RejectNullBytesInterceptor();

  it('пропускает чистое тело', async () => {
    const ctx = contextWith({ name: 'Иван', tags: ['a', 'b'], n: 1 });
    await expect(
      lastValueFrom(interceptor.intercept(ctx, handler())),
    ).resolves.toBe('ok');
  });

  it('пропускает отсутствующее тело', async () => {
    const ctx = contextWith(undefined);
    await expect(
      lastValueFrom(interceptor.intercept(ctx, handler())),
    ).resolves.toBe('ok');
  });

  it('отклоняет NUL во вложенной строке body', () => {
    const ctx = contextWith({ customer: { name: `Ivan${NUL}Petrov` } });
    expect(() => interceptor.intercept(ctx, handler())).toThrow(
      BadRequestException,
    );
  });

  it('отклоняет NUL в query', () => {
    const ctx = contextWith({}, { search: `abc${NUL}` });
    expect(() => interceptor.intercept(ctx, handler())).toThrow(
      BadRequestException,
    );
  });

  it('пропускает переводы строк (многострочные поля легитимны)', async () => {
    const ctx = contextWith({ text: `line1${LF}line2` });
    await expect(
      lastValueFrom(interceptor.intercept(ctx, handler())),
    ).resolves.toBe('ok');
  });
});
