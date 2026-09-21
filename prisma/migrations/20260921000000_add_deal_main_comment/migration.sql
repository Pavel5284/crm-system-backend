-- Главный комментарий к сделке (редактируют только ADMIN/MANAGER).
-- NULL = не задан; бэкенд пишет сюда через PATCH /deals/:id/main-comment.
ALTER TABLE "deals" ADD COLUMN "mainComment" TEXT;
