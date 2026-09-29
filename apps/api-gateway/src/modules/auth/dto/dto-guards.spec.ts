import 'reflect-metadata';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';

const NUL = String.fromCharCode(0);
const LF = String.fromCharCode(10);

async function errorsOn(dto: object): Promise<string[]> {
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map(
    (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
  );
}

describe('DTO injection guards', () => {
  it('register: имя с переносом строки отклоняется', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'alice@example.com',
      password: 'password123',
      name: `Ivan${LF}Petrov`,
    });
    const errs = await errorsOn(dto);
    expect(errs.some((e) => e.startsWith('name:'))).toBe(true);
  });

  it('register: имя с NUL-байтом отклоняется', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'alice@example.com',
      password: 'password123',
      name: `${NUL}Ivan`,
    });
    const errs = await errorsOn(dto);
    expect(errs.some((e) => e.startsWith('name:'))).toBe(true);
  });

  it('register: обычное имя проходит', async () => {
    const dto = Object.assign(new RegisterDto(), {
      email: 'alice@example.com',
      password: 'password123',
      name: 'Иван Петров-Сидоров',
    });
    await expect(errorsOn(dto)).resolves.toEqual([]);
  });

  it('login: кириллический пароль отклоняется', async () => {
    const dto = Object.assign(new LoginDto(), {
      email: 'alice@example.com',
      password: 'пароль123',
    });
    const errs = await errorsOn(dto);
    expect(errs.some((e) => e.startsWith('password:'))).toBe(true);
  });

  it('login: ASCII-пароль проходит', async () => {
    const dto = Object.assign(new LoginDto(), {
      email: 'alice@example.com',
      password: 'P@ssw0rd!',
    });
    await expect(errorsOn(dto)).resolves.toEqual([]);
  });
});
