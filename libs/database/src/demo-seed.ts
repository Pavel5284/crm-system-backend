import * as argon2 from "argon2";
import {
  DealPriority,
  NotificationType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";
import {
  DEMO_CUSTOMER_EMAIL_DOMAIN,
  DEMO_CUSTOMER_SOURCE,
  DEMO_USER_EMAILS,
  DEMO_USER_ROLES,
} from "@app/shared";

export interface DemoSeedOptions {
  // Пароль для demo1/demo2/demo3. В проде задаётся через DEMO_PASSWORD,
  // по умолчанию — 'Demo12345'.
  password: string;
}

export interface DemoSeedStats {
  users: number;
  customers: number;
  deals: number;
  dealItems: number;
  comments: number;
  stageHistory: number;
  tasks: number;
  orders: number;
  payments: number;
  messages: number;
  notifications: number;
}

export const DEFAULT_DEMO_PASSWORD = "Demo12345";

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

// Демо-пользователи при сбросе сохраняются — удаляется только их контент.
export async function clearDemoData(
  prisma: PrismaClient,
): Promise<Partial<DemoSeedStats>> {
  const demoUsers = await prisma.user.findMany({
    where: { email: { in: [...DEMO_USER_EMAILS] } },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);

  const demoCustomers = await prisma.customer.findMany({
    where: {
      OR: [
        { email: { endsWith: `@${DEMO_CUSTOMER_EMAIL_DOMAIN}` } },
        { fromSource: DEMO_CUSTOMER_SOURCE },
      ],
    },
    select: { id: true },
  });
  const demoCustomerIds = demoCustomers.map((c) => c.id);

  const demoDeals = demoCustomerIds.length
    ? await prisma.deal.findMany({
        where: { customerId: { in: demoCustomerIds } },
        select: { id: true },
      })
    : [];
  const demoDealIds = demoDeals.map((d) => d.id);

  const demoOrders =
    demoCustomerIds.length || demoDealIds.length
      ? await prisma.order.findMany({
          where: {
            OR: [
              { customerId: { in: demoCustomerIds } },
              { dealId: { in: demoDealIds } },
            ],
          },
          select: { id: true },
        })
      : [];
  const demoOrderIds = demoOrders.map((o) => o.id);

  const demoPayments = demoOrderIds.length
    ? await prisma.payment.findMany({
        where: { orderId: { in: demoOrderIds } },
        select: { id: true },
      })
    : [];
  const demoPaymentIds = demoPayments.map((p) => p.id);

  // Порядок — от листьев к корням, иначе упрёмся в FK.
  if (demoPaymentIds.length) {
    await prisma.paymentStatusHistory.deleteMany({
      where: { paymentId: { in: demoPaymentIds } },
    });
    await prisma.payment.deleteMany({
      where: { id: { in: demoPaymentIds } },
    });
  }
  if (demoOrderIds.length) {
    await prisma.orderStatusHistory.deleteMany({
      where: { orderId: { in: demoOrderIds } },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: demoOrderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: demoOrderIds } } });
  }
  if (demoDealIds.length) {
    await prisma.comment.deleteMany({
      where: { dealId: { in: demoDealIds } },
    });
    await prisma.dealAttachment.deleteMany({
      where: { dealId: { in: demoDealIds } },
    });
    await prisma.dealStageHistory.deleteMany({
      where: { dealId: { in: demoDealIds } },
    });
    await prisma.dealItem.deleteMany({
      where: { dealId: { in: demoDealIds } },
    });
    await prisma.deal.deleteMany({ where: { id: { in: demoDealIds } } });
  }
  if (demoUserIds.length) {
    await prisma.task.deleteMany({
      where: { authorId: { in: demoUserIds } },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: demoUserIds } },
    });
    await prisma.directMessage.deleteMany({
      where: {
        OR: [
          { senderId: { in: demoUserIds } },
          { receiverId: { in: demoUserIds } },
        ],
      },
    });
  }
  if (demoCustomerIds.length) {
    await prisma.customer.deleteMany({
      where: { id: { in: demoCustomerIds } },
    });
  }

  return {
    customers: demoCustomerIds.length,
    deals: demoDealIds.length,
    orders: demoOrderIds.length,
    payments: demoPaymentIds.length,
  };
}

export async function seedDemoData(
  prisma: PrismaClient,
  options: DemoSeedOptions,
): Promise<DemoSeedStats> {
  const passwordHash = await argon2.hash(options.password);

  const users = new Map<string, { id: string; name: string }>();
  const profiles: Array<{
    email: (typeof DEMO_USER_EMAILS)[number];
    name: string;
    position: string;
    phone: string;
    telegram: string;
  }> = [
    {
      email: "demo1@example.com",
      name: "Демо Админ",
      position: "Администратор",
      phone: "+79991112233",
      telegram: "@demo_admin",
    },
    {
      email: "demo2@example.com",
      name: "Демо Менеджер",
      position: "Менеджер",
      phone: "+79992223344",
      telegram: "@demo_manager",
    },
    {
      email: "demo3@example.com",
      name: "Демо Логист",
      position: "Логист",
      phone: "+79993334455",
      telegram: "@demo_logist",
    },
  ];
  for (const p of profiles) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {
        name: p.name,
        position: p.position,
        phone: p.phone,
        telegram: p.telegram,
        role: DEMO_USER_ROLES[p.email] as Role,
        passwordHash,
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        email: p.email,
        name: p.name,
        position: p.position,
        phone: p.phone,
        telegram: p.telegram,
        role: DEMO_USER_ROLES[p.email] as Role,
        passwordHash,
        isEmailVerified: true,
      },
      select: { id: true, name: true },
    });
    users.set(p.email, user);
  }
  const demo1 = users.get("demo1@example.com")!;
  const demo2 = users.get("demo2@example.com")!;
  const demo3 = users.get("demo3@example.com")!;

  const customerInputs = [
    {
      name: "ООО «СтройМонтаж»",
      email: `demo-stroymontazh@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      phone: "+7 (495) 120-45-67",
      contactPerson: "Иван Петров",
    },
    {
      name: "ИП Соколова А.В.",
      email: `demo-sokolova@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      phone: "+7 916 345-67-89",
      contactPerson: "Анна Соколова",
    },
    {
      name: "АО «СеверСталь»",
      email: `demo-severstal@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      phone: "+7 (812) 340-12-90",
      contactPerson: "Дмитрий Орлов",
    },
    {
      name: "ООО «МебельГрад»",
      email: `demo-mebelgrad@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      phone: "+7 (343) 278-55-31",
      contactPerson: "Ольга Миронова",
    },
    {
      name: "ИП Кузнецов",
      email: `demo-kuznecov@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      phone: "+7 925 678-12-34",
      contactPerson: "Сергей Кузнецов",
    },
    {
      name: "ООО «ТехноПарк»",
      email: `demo-tehnopark@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      phone: "+7 (495) 789-01-23",
      contactPerson: "Марина Власова",
    },
  ];
  const customers = new Map<string, { id: string; name: string }>();
  for (const c of customerInputs) {
    const customer = await prisma.customer.upsert({
      where: { email: c.email },
      update: {
        name: c.name,
        phone: c.phone,
        contactPerson: c.contactPerson,
        fromSource: DEMO_CUSTOMER_SOURCE,
      },
      create: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        contactPerson: c.contactPerson,
        fromSource: DEMO_CUSTOMER_SOURCE,
      },
      select: { id: true, name: true },
    });
    customers.set(c.email, customer);
  }
  const customerId = (email: string) => customers.get(email)!.id;

  // Сделки сразу создаются на нужной стадии (state machine действует только
  // на ручные переходы через API, seed пишет напрямую). История переходов
  // заполняется вручную, чтобы канбан выглядел живо.
  const dealInputs: Array<{
    key: string;
    name: string;
    description: string;
    mainComment?: string;
    price: number;
    status: string;
    customerEmail: string;
    responsibleId: string;
    deadlineDays: number;
    priority: DealPriority;
    items: Array<{
      name: string;
      quantity: number;
      unit: string;
      spec: string;
    }>;
  }> = [
    {
      key: "windows",
      name: 'Оконные блоки для ЖК "Северный"',
      description:
        "Остекление двух подъездов: 120 оконных блоков, профиль 70мм, двухкамерный стеклопакет. Замеры выполнены, ждём предоплату.",
      price: 450000,
      status: "todo",
      customerEmail: `demo-stroymontazh@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      responsibleId: demo2.id,
      deadlineDays: 14,
      priority: DealPriority.HIGH,
      items: [
        {
          name: "Оконный блок 1500x1400",
          quantity: 80,
          unit: "шт",
          spec: "Профиль 70мм, 2-камерный",
        },
        {
          name: "Оконный блок 1200x1400",
          quantity: 40,
          unit: "шт",
          spec: "Профиль 70мм, 2-камерный",
        },
      ],
    },
    {
      key: "doors",
      name: "Межкомнатные двери, 40 шт",
      description:
        "Двери из массива бука для офисного центра. Цвет и фурнитуру согласовать с дизайнером заказчика.",
      price: 320000,
      status: "todo",
      customerEmail: `demo-mebelgrad@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      responsibleId: demo2.id,
      deadlineDays: 21,
      priority: DealPriority.MEDIUM,
      items: [
        {
          name: "Дверное полотно 800мм",
          quantity: 28,
          unit: "шт",
          spec: "Массив бука, лак",
        },
        {
          name: "Дверное полотно 900мм",
          quantity: 12,
          unit: "шт",
          spec: "Массив бука, лак",
        },
      ],
    },
    {
      key: "facade",
      name: 'Фасадные панели для ТЦ "Галерея"',
      description:
        "Вентилируемый фасад, 850 м2. Проект на согласовании у заказчика, правки по цвету панелей внесены.",
      mainComment: "Держать на контроле: крупный чек, решение до конца недели",
      price: 1200000,
      status: "to-be-agreed",
      customerEmail: `demo-severstal@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      responsibleId: demo1.id,
      deadlineDays: 10,
      priority: DealPriority.HIGH,
      items: [
        {
          name: "Фасадная панель АКП",
          quantity: 850,
          unit: "м2",
          spec: "Алюминиевый композит, RAL 7016",
        },
        {
          name: "Подсистема крепления",
          quantity: 850,
          unit: "м2",
          spec: "Оцинковка",
        },
      ],
    },
    {
      key: "kitchen",
      name: "Кухонные гарнитуры, 12 шт",
      description:
        "Кухни для жилого комплекса: фасады МДФ эмаль, столешница искусственный камень. Производство запущено.",
      mainComment: "Фурнитуру заказать до понедельника, иначе срыв сроков",
      price: 980000,
      status: "in-progress",
      customerEmail: `demo-sokolova@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      responsibleId: demo2.id,
      deadlineDays: 7,
      priority: DealPriority.HIGH,
      items: [
        {
          name: "Кухонный гарнитур 3.2м",
          quantity: 8,
          unit: "компл.",
          spec: "МДФ эмаль, Blum",
        },
        {
          name: "Кухонный гарнитур 2.6м",
          quantity: 4,
          unit: "компл.",
          spec: "МДФ эмаль, Blum",
        },
      ],
    },
    {
      key: "wardrobe",
      name: "Шкафы-купе для офиса",
      description:
        "20 шкафов-купе с зеркальными дверцами. Материал раскроен, сборка на следующей неделе.",
      price: 540000,
      status: "in-progress",
      customerEmail: `demo-tehnopark@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      responsibleId: demo3.id,
      deadlineDays: 5,
      priority: DealPriority.MEDIUM,
      items: [
        {
          name: "Шкаф-купе 1800мм",
          quantity: 20,
          unit: "шт",
          spec: "ЛДСП + зеркало",
        },
      ],
    },
    {
      key: "stairs",
      name: "Дубовая лестница для коттеджа",
      description:
        "Лестница из массива дуба с коваными перилами. Изготовлена, ждёт проверки качества перед отгрузкой.",
      price: 275000,
      status: "produced",
      customerEmail: `demo-kuznecov@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      responsibleId: demo3.id,
      deadlineDays: 2,
      priority: DealPriority.LOW,
      items: [
        {
          name: "Лестничный марш",
          quantity: 1,
          unit: "компл.",
          spec: "Дуб, лак",
        },
        {
          name: "Кованые перила",
          quantity: 8,
          unit: "м",
          spec: "Порошковая окраска",
        },
      ],
    },
    {
      key: "reception",
      name: "Ресепшн для клиники",
      description:
        "Стойка ресепшн из искусственного камня с подсветкой. Отгружена, документы подписаны.",
      price: 410000,
      status: "done",
      customerEmail: `demo-mebelgrad@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      responsibleId: demo2.id,
      deadlineDays: -3,
      priority: DealPriority.MEDIUM,
      items: [
        {
          name: "Стойка ресепшн 4м",
          quantity: 1,
          unit: "шт",
          spec: "Иск. камень, LED",
        },
      ],
    },
    {
      key: "partitions",
      name: "Перегородки open-space",
      description:
        "Алюминиевые перегородки для офиса 400 м2. Монтаж завершён, заказчик принял работы.",
      price: 660000,
      status: "done",
      customerEmail: `demo-stroymontazh@${DEMO_CUSTOMER_EMAIL_DOMAIN}`,
      responsibleId: demo1.id,
      deadlineDays: -10,
      priority: DealPriority.LOW,
      items: [
        {
          name: "Перегородка алюминиевая",
          quantity: 400,
          unit: "м2",
          spec: "Стекло 5мм, профиль",
        },
      ],
    },
  ];

  const deals = new Map<string, { id: string; name: string; status: string }>();
  let dealItemsCount = 0;
  for (const d of dealInputs) {
    const deal = await prisma.deal.create({
      data: {
        name: d.name,
        description: d.description,
        mainComment: d.mainComment,
        price: d.price,
        status: d.status,
        customerId: customerId(d.customerEmail),
        responsibleUserId: d.responsibleId,
        responsibleUserIds: [d.responsibleId],
        deadline: daysFromNow(d.deadlineDays),
        priority: d.priority,
        items: {
          create: d.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            spec: i.spec,
          })),
        },
      },
      select: { id: true, name: true, status: true },
    });
    deals.set(d.key, deal);
    dealItemsCount += d.items.length;
  }
  const dealId = (key: string) => deals.get(key)!.id;

  // История стадий: у входящих её нет (показывает empty-state), у остальных —
  // цепочка от todo до текущей стадии.
  const stagePaths: Record<string, string[]> = {
    facade: ["todo", "to-be-agreed"],
    kitchen: ["todo", "to-be-agreed", "in-progress"],
    wardrobe: ["todo", "to-be-agreed", "in-progress"],
    stairs: ["todo", "to-be-agreed", "in-progress", "produced"],
    reception: ["todo", "to-be-agreed", "in-progress", "produced", "done"],
    partitions: ["todo", "to-be-agreed", "in-progress", "produced", "done"],
  };
  let stageHistoryCount = 0;
  for (const [key, path] of Object.entries(stagePaths)) {
    for (let i = 1; i < path.length; i++) {
      await prisma.dealStageHistory.create({
        data: {
          dealId: dealId(key),
          fromStage: path[i - 1],
          toStage: path[i],
          changedByUserId: i % 2 === 0 ? demo2.id : demo1.id,
          comment: i === path.length - 1 ? "Переход по итогам планёрки" : null,
        },
      });
      stageHistoryCount++;
    }
  }

  const commentInputs: Array<{
    dealKey: string;
    user: { id: string; name: string };
    email: string;
    text: string;
  }> = [
    {
      dealKey: "facade",
      user: demo1,
      email: "demo1@example.com",
      text: "Заказчик попросил прислать образцы цвета до четверга",
    },
    {
      dealKey: "facade",
      user: demo2,
      email: "demo2@example.com",
      text: "Образцы заказал, курьер заберёт завтра",
    },
    {
      dealKey: "kitchen",
      user: demo2,
      email: "demo2@example.com",
      text: "Производство подтверждает запуск, фурнитура в пути",
    },
    {
      dealKey: "kitchen",
      user: demo3,
      email: "demo3@example.com",
      text: "Принял, встречу груз в понедельник",
    },
    {
      dealKey: "stairs",
      user: demo3,
      email: "demo3@example.com",
      text: "Проверка качества назначена на завтра, фото приложу",
    },
    {
      dealKey: "partitions",
      user: demo1,
      email: "demo1@example.com",
      text: "Заказчик доволен, просит КП на второй этаж",
    },
  ];
  for (const c of commentInputs) {
    await prisma.comment.create({
      data: {
        dealId: dealId(c.dealKey),
        userId: c.user.id,
        userName: c.user.name,
        userEmail: c.email,
        text: c.text,
      },
    });
  }

  const taskInputs: Array<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDays: number | null;
    authorId: string;
    assigneeId: string;
  }> = [
    {
      title: "Согласовать чертёж фасада с заказчиком",
      description: "Отправить обновлённый чертёж и получить письменное ОК",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDays: 2,
      authorId: demo1.id,
      assigneeId: demo2.id,
    },
    {
      title: "Заказать фурнитуру для кухонь",
      description: "Blum: петли, направляющие, подъёмники по спецификации",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      dueDays: 5,
      authorId: demo2.id,
      assigneeId: demo3.id,
    },
    {
      title: "Позвонить ТехноПарку по замерам",
      description: "Уточнить время приезда замерщика",
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      dueDays: -1,
      authorId: demo2.id,
      assigneeId: demo2.id,
    },
    {
      title: "Подготовить счёт для СеверСтали",
      description: "Счёт на 30% предоплаты по фасаду",
      status: TaskStatus.DONE,
      priority: TaskPriority.LOW,
      dueDays: -5,
      authorId: demo1.id,
      assigneeId: demo2.id,
    },
    {
      title: "Проверить качество лестницы перед отгрузкой",
      description: "Осмотр, фото, чек-лист приёмки",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
      dueDays: 1,
      authorId: demo3.id,
      assigneeId: demo3.id,
    },
    {
      title: "Обновить каталог материалов",
      description: "Добавить новые декоры ЛДСП и образцы камня",
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
      dueDays: null,
      authorId: demo1.id,
      assigneeId: demo3.id,
    },
    {
      title: "Согласовать логистику отгрузки ресепшна",
      description: "Машина и грузчики на четверг",
      status: TaskStatus.DONE,
      priority: TaskPriority.MEDIUM,
      dueDays: -4,
      authorId: demo2.id,
      assigneeId: demo3.id,
    },
    {
      title: "Настроить шаблоны счетов",
      description: "Логотип и реквизиты в печатной форме",
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
      dueDays: 7,
      authorId: demo1.id,
      assigneeId: demo1.id,
    },
  ];
  for (const t of taskInputs) {
    await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDays === null ? null : daysFromNow(t.dueDays),
        authorId: t.authorId,
        assigneeId: t.assigneeId,
      },
    });
  }

  // Заказы со связной историей статусов и оплатами: суммы сходятся
  // (оплачено/остаток как в OrdersService.toListDto).
  const order1 = await prisma.order.create({
    data: {
      dealId: dealId("kitchen"),
      customerId: customerId(`demo-sokolova@${DEMO_CUSTOMER_EMAIL_DOMAIN}`),
      createdById: demo2.id,
      total: 980000,
      status: OrderStatus.CONFIRMED,
      comment: "Предоплата 30% ожидается",
      items: {
        create: [
          {
            name: "Кухонный гарнитур 3.2м",
            quantity: 8,
            unit: "компл.",
            price: 85000,
            spec: "МДФ эмаль, Blum",
          },
          {
            name: "Кухонный гарнитур 2.6м",
            quantity: 4,
            unit: "компл.",
            price: 75000,
            spec: "МДФ эмаль, Blum",
          },
        ],
      },
      statusHistory: {
        create: [
          {
            fromStatus: null,
            toStatus: OrderStatus.DRAFT,
            changedByUserId: demo2.id,
            comment: "Заказ создан",
          },
          {
            fromStatus: OrderStatus.DRAFT,
            toStatus: OrderStatus.CONFIRMED,
            changedByUserId: demo2.id,
            comment: "Подтверждён менеджером",
          },
        ],
      },
    },
    select: { id: true },
  });

  const order2 = await prisma.order.create({
    data: {
      dealId: dealId("reception"),
      customerId: customerId(`demo-mebelgrad@${DEMO_CUSTOMER_EMAIL_DOMAIN}`),
      createdById: demo2.id,
      total: 410000,
      status: OrderStatus.PAID,
      comment: "Оплачен полностью",
      items: {
        create: [
          {
            name: "Стойка ресепшн 4м",
            quantity: 1,
            unit: "шт.",
            price: 410000,
            spec: "Иск. камень, LED",
          },
        ],
      },
      statusHistory: {
        create: [
          {
            fromStatus: null,
            toStatus: OrderStatus.DRAFT,
            changedByUserId: demo2.id,
            comment: "Заказ создан",
          },
          {
            fromStatus: OrderStatus.DRAFT,
            toStatus: OrderStatus.CONFIRMED,
            changedByUserId: demo2.id,
            comment: "Подтверждён менеджером",
          },
          {
            fromStatus: OrderStatus.CONFIRMED,
            toStatus: OrderStatus.PAID,
            changedByUserId: demo2.id,
            comment: "Автопересчёт: оплачено 410000 из 410000",
          },
        ],
      },
    },
    select: { id: true },
  });

  // Черновик без оплат: создаём без переменной — платежи и история
  // к нему не привязываются, это и показывает empty-state.
  await prisma.order.create({
    data: {
      customerId: customerId(`demo-stroymontazh@${DEMO_CUSTOMER_EMAIL_DOMAIN}`),
      createdById: demo1.id,
      total: 150000,
      status: OrderStatus.DRAFT,
      comment: "Черновик: доборные элементы для окон",
      items: {
        create: [
          {
            name: "Подоконник 200мм",
            quantity: 120,
            unit: "м",
            price: 900,
            spec: "ПВХ белый",
          },
          {
            name: "Откосная панель",
            quantity: 120,
            unit: "м",
            price: 350,
            spec: "Сэндвич-панель",
          },
        ],
      },
      statusHistory: {
        create: [
          {
            fromStatus: null,
            toStatus: OrderStatus.DRAFT,
            changedByUserId: demo1.id,
            comment: "Заказ создан",
          },
        ],
      },
    },
    select: { id: true },
  });

  const order4 = await prisma.order.create({
    data: {
      dealId: dealId("partitions"),
      customerId: customerId(`demo-stroymontazh@${DEMO_CUSTOMER_EMAIL_DOMAIN}`),
      createdById: demo1.id,
      total: 660000,
      status: OrderStatus.PARTIALLY_PAID,
      comment: "Второй транш после подписания акта",
      items: {
        create: [
          {
            name: "Перегородка алюминиевая",
            quantity: 400,
            unit: "м2",
            price: 1650,
            spec: "Стекло 5мм, профиль",
          },
        ],
      },
      statusHistory: {
        create: [
          {
            fromStatus: null,
            toStatus: OrderStatus.DRAFT,
            changedByUserId: demo1.id,
            comment: "Заказ создан",
          },
          {
            fromStatus: OrderStatus.DRAFT,
            toStatus: OrderStatus.CONFIRMED,
            changedByUserId: demo1.id,
            comment: "Подтверждён менеджером",
          },
          {
            fromStatus: OrderStatus.CONFIRMED,
            toStatus: OrderStatus.PARTIALLY_PAID,
            changedByUserId: demo1.id,
            comment: "Автопересчёт: оплачено 300000 из 660000",
          },
        ],
      },
    },
    select: { id: true },
  });

  const paymentInputs: Array<{
    orderId: string;
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    comment: string;
    paid: boolean;
  }> = [
    {
      orderId: order2.id,
      amount: 410000,
      method: PaymentMethod.TRANSFER,
      status: PaymentStatus.SUCCEEDED,
      comment: "Оплата по счёту",
      paid: true,
    },
    {
      orderId: order4.id,
      amount: 300000,
      method: PaymentMethod.CARD,
      status: PaymentStatus.SUCCEEDED,
      comment: "Первый транш",
      paid: true,
    },
    {
      orderId: order4.id,
      amount: 100000,
      method: PaymentMethod.SBP,
      status: PaymentStatus.PENDING,
      comment: "Ожидаем подтверждение",
      paid: false,
    },
    {
      orderId: order1.id,
      amount: 294000,
      method: PaymentMethod.CASH,
      status: PaymentStatus.PENDING,
      comment: "Предоплата 30% наличными",
      paid: false,
    },
  ];
  for (const p of paymentInputs) {
    await prisma.payment.create({
      data: {
        orderId: p.orderId,
        amount: p.amount,
        method: p.method,
        status: p.status,
        comment: p.comment,
        paidAt: p.paid ? minutesAgo(60) : null,
        createdById: demo2.id,
        statusHistory: {
          create: [
            {
              fromStatus: null,
              toStatus: PaymentStatus.PENDING,
              changedByUserId: demo2.id,
              comment: "Платёж создан",
            },
            ...(p.paid
              ? [
                  {
                    fromStatus: PaymentStatus.PENDING,
                    toStatus: p.status,
                    changedByUserId: demo2.id,
                    comment: "Платёж подтверждён",
                  },
                ]
              : []),
          ],
        },
      },
    });
  }

  const messageInputs: Array<{
    senderId: string;
    receiverId: string;
    text: string;
    read: boolean;
    agoMinutes: number;
  }> = [
    {
      senderId: demo1.id,
      receiverId: demo2.id,
      text: "Привет! Посмотри чертёж фасада для Галереи, нужно согласовать до пятницы",
      read: true,
      agoMinutes: 180,
    },
    {
      senderId: demo2.id,
      receiverId: demo1.id,
      text: "Принял, сегодня отправлю заказчику",
      read: true,
      agoMinutes: 150,
    },
    {
      senderId: demo2.id,
      receiverId: demo3.id,
      text: "Фурнитура для кухонь заказана, трек скину вечером",
      read: false,
      agoMinutes: 90,
    },
    {
      senderId: demo3.id,
      receiverId: demo2.id,
      text: "Отлично, производство ждёт к понедельнику",
      read: false,
      agoMinutes: 60,
    },
    {
      senderId: demo1.id,
      receiverId: demo3.id,
      text: "Напомни логистам про отгрузку ресепшна",
      read: false,
      agoMinutes: 30,
    },
  ];
  for (const m of messageInputs) {
    await prisma.directMessage.create({
      data: {
        senderId: m.senderId,
        receiverId: m.receiverId,
        text: m.text,
        read: m.read,
        createdAt: minutesAgo(m.agoMinutes),
      },
    });
  }

  const notificationInputs: Array<{
    userId: string;
    type: NotificationType;
    payload: Prisma.InputJsonValue;
  }> = [
    {
      userId: demo2.id,
      type: NotificationType.TASK_ASSIGNED,
      payload: {
        taskTitle: "Согласовать чертёж фасада с заказчиком",
        actorName: "Демо Админ",
      },
    },
    {
      userId: demo2.id,
      type: NotificationType.DEAL_ASSIGNED,
      payload: {
        dealName: 'Оконные блоки для ЖК "Северный"',
        actorName: "Демо Админ",
      },
    },
    {
      userId: demo3.id,
      type: NotificationType.TASK_ASSIGNED,
      payload: {
        taskTitle: "Заказать фурнитуру для кухонь",
        actorName: "Демо Менеджер",
      },
    },
    {
      userId: demo3.id,
      type: NotificationType.DEAL_DEADLINE_SOON,
      payload: { dealName: "Шкафы-купе для офиса", deadlineInDays: 5 },
    },
    {
      userId: demo1.id,
      type: NotificationType.TASK_COMPLETED,
      payload: {
        taskTitle: "Подготовить счёт для СеверСтали",
        actorName: "Демо Менеджер",
      },
    },
    {
      userId: demo1.id,
      type: NotificationType.DEAL_STAGE_CHANGED,
      payload: {
        dealName: "Перегородки open-space",
        fromStage: "produced",
        toStage: "done",
      },
    },
  ];
  for (const n of notificationInputs) {
    await prisma.notification.create({
      data: { userId: n.userId, type: n.type, payload: n.payload },
    });
  }

  return {
    users: users.size,
    customers: customerInputs.length,
    deals: dealInputs.length,
    dealItems: dealItemsCount,
    comments: commentInputs.length,
    stageHistory: stageHistoryCount,
    tasks: taskInputs.length,
    orders: 4,
    payments: paymentInputs.length,
    messages: messageInputs.length,
    notifications: notificationInputs.length,
  };
}
