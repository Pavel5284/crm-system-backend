import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  clearDemoData,
  seedDemoData,
  DEFAULT_DEMO_PASSWORD,
} from "@app/database";
import { DEMO_USER_EMAILS } from "@app/shared";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
  // Полный ресид демо-скоупа: сначала чистим старые демо-данные
  // (боевые не трогаем — clearDemoData бьёт только по demo.local/demo-юзерам),
  // затем создаём заново. Демо-пользователи сохраняются (upsert).
  const cleared = await clearDemoData(prisma);
  const stats = await seedDemoData(prisma, { password });
  console.log("Demo seed завершён.");
  console.log(
    `Очищено демо-сущностей: customers=${cleared.customers ?? 0}, deals=${cleared.deals ?? 0}, orders=${cleared.orders ?? 0}, payments=${cleared.payments ?? 0}`,
  );
  console.log(`Создано: ${JSON.stringify(stats)}`);
  console.log(
    `Логины: ${DEMO_USER_EMAILS.join(", ")} / пароль: ${password === DEFAULT_DEMO_PASSWORD ? DEFAULT_DEMO_PASSWORD + " (дефолт, см. DEMO_PASSWORD)" : "(из DEMO_PASSWORD)"}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
