-- Нормализация email к нижнему регистру (регистрация/логин с этого
-- момента ищут по LOWER, см. NormalizeEmail в auth DTO).
-- Если два аккаунта отличаются только регистром — миграция падает с понятной
-- ошибкой: такой конфликт решается вручную, молча склеивать чужие аккаунты нельзя.
DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER(email) FROM "users" GROUP BY LOWER(email) HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Conflicting user emails differ only by letter case. Resolve manually before migrating.';
  END IF;
END
$$;

UPDATE "users" SET email = LOWER(email) WHERE email <> LOWER(email);
