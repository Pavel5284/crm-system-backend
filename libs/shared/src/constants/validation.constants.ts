// Email — только латиница: кириллицу и прочий Unicode не принимаем
// (продуктовое решение; class-validator `@IsEmail()` мягче и пропустил бы
// UTF-8 в локальной части). Зеркало фронтенд-regex в `@crm/ui-kit/fields`:
// править оба места 1-в-1.
export const ASCII_EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const ASCII_EMAIL_MESSAGE =
  "Email должен содержать только латинские буквы, цифры и символы";
