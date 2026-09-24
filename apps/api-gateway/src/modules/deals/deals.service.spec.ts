import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { DealPriority, Role } from '@prisma/client';
import { PrismaService } from '@app/database';
import { DEAL_EVENTS } from '@app/shared';
import { DealsService } from './deals.service';

function createArgOf(mock: { mock: { calls: unknown[][] } }): {
  data: Record<string, unknown>;
} {
  return mock.mock.calls[0][0] as { data: Record<string, unknown> };
}

describe('DealsService', () => {
  let service: DealsService;
  let prisma: {
    deal: Record<
      'findUnique' | 'findMany' | 'create' | 'update' | 'delete',
      jest.Mock
    >;
    customer: Record<'findUnique' | 'create', jest.Mock>;
    user: Record<'findUnique' | 'findMany', jest.Mock>;
    stageTransitionRule: Record<'findUnique' | 'findMany', jest.Mock>;
    dealStageHistory: Record<'create', jest.Mock>;
    $transaction: jest.Mock;
  };
  let notificationsClient: { emit: jest.Mock };
  let remindersQueue: { add: jest.Mock; remove: jest.Mock };
  let configService: { get: jest.Mock };

  const customer = {
    id: 'customer-1',
    name: 'Клиент',
    email: 'c@c.com',
    phone: '+7 900 000-00-00',
    contactPerson: 'Иван',
    fromSource: 'site',
  };

  const baseDeal = {
    id: 'deal-1',
    name: 'Сделка',
    description: 'Достаточно длинное описание',
    mainComment: null,
    price: 1000,
    status: 'todo',
    customerId: customer.id,
    customer,
    responsibleUserId: 'user-resp',
    responsibleUserIds: ['user-resp'],
    deadline: null,
    priority: DealPriority.MEDIUM,
    isImported: false,
    importedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const actor = { id: 'user-actor', email: 'a@a.com', role: Role.MANAGER };

  const rule = {
    id: 'rule-1',
    fromStage: 'todo',
    toStage: 'to-be-agreed',
    allowedRoles: [Role.MANAGER, Role.ADMIN, Role.USER],
    requiredFields: ['description'],
  };

  beforeEach(async () => {
    prisma = {
      deal: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      customer: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      stageTransitionRule: { findUnique: jest.fn(), findMany: jest.fn() },
      dealStageHistory: { create: jest.fn() },
      $transaction: jest.fn((promises: Promise<unknown>[]) =>
        Promise.all(promises),
      ),
    };
    notificationsClient = { emit: jest.fn() };
    remindersQueue = { add: jest.fn(), remove: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'NOTIFICATIONS_SERVICE', useValue: notificationsClient },
        { provide: getQueueToken('deal-reminders'), useValue: remindersQueue },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(DealsService);
  });

  describe('changeStage', () => {
    it('бросает NotFoundException, если сделка не найдена', async () => {
      prisma.deal.findUnique.mockResolvedValue(null);
      await expect(
        service.changeStage(
          'missing',
          { targetStage: 'done', comment: 'x' },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('возвращает сделку без изменений при переходе в текущий stage', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      const result = await service.changeStage(
        'deal-1',
        { targetStage: 'todo', comment: 'x' },
        actor,
      );
      expect(result.status).toBe('todo');
      expect(prisma.deal.update).not.toHaveBeenCalled();
      expect(prisma.dealStageHistory.create).not.toHaveBeenCalled();
      expect(notificationsClient.emit).not.toHaveBeenCalled();
    });

    it('бросает BadRequestException, если правило перехода не найдено', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.stageTransitionRule.findUnique.mockResolvedValue(null);
      const promise = service.changeStage(
        'deal-1',
        { targetStage: 'done', comment: 'x' },
        actor,
      );
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow(/запрещён/);
    });

    it('бросает BadRequestException с ролью, если роль не разрешена', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.stageTransitionRule.findUnique.mockResolvedValue(rule);
      const promise = service.changeStage(
        'deal-1',
        { targetStage: 'to-be-agreed', comment: 'x' },
        { ...actor, role: Role.LOGIST },
      );
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow(/LOGIST/);
    });

    it('бросает BadRequestException со списком незаполненных полей', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        ...baseDeal,
        description: '',
      });
      prisma.stageTransitionRule.findUnique.mockResolvedValue(rule);
      const promise = service.changeStage(
        'deal-1',
        { targetStage: 'to-be-agreed', comment: 'x' },
        actor,
      );
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow(/description/);
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('успешный переход: обновляет stage, пишет историю, эмитит событие', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.stageTransitionRule.findUnique.mockResolvedValue(rule);
      prisma.user.findUnique.mockResolvedValue({ id: actor.id });
      const updated = { ...baseDeal, status: 'to-be-agreed' };
      prisma.deal.update.mockResolvedValue(updated);
      prisma.dealStageHistory.create.mockResolvedValue({ id: 'h-1' });

      const result = await service.changeStage(
        'deal-1',
        { targetStage: 'to-be-agreed', comment: 'согласовано' },
        actor,
      );

      expect(result.status).toBe('to-be-agreed');
      expect(prisma.deal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deal-1' },
          data: { status: 'to-be-agreed' },
        }),
      );
      expect(createArgOf(prisma.dealStageHistory.create).data).toMatchObject({
        dealId: 'deal-1',
        fromStage: 'todo',
        toStage: 'to-be-agreed',
        changedByUserId: actor.id,
        comment: 'согласовано',
      });
      expect(notificationsClient.emit).toHaveBeenCalledWith(
        DEAL_EVENTS.STAGE_CHANGED,
        expect.objectContaining({
          fromStage: 'todo',
          toStage: 'to-be-agreed',
          actorId: actor.id,
        }),
      );
    });

    it('не уведомляет, если stage меняет сам ответственный', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        ...baseDeal,
        responsibleUserId: actor.id,
      });
      prisma.stageTransitionRule.findUnique.mockResolvedValue(rule);
      prisma.user.findUnique.mockResolvedValue({ id: actor.id });
      prisma.deal.update.mockResolvedValue({
        ...baseDeal,
        responsibleUserId: actor.id,
        status: 'to-be-agreed',
      });
      prisma.dealStageHistory.create.mockResolvedValue({ id: 'h-1' });

      await service.changeStage(
        'deal-1',
        { targetStage: 'to-be-agreed', comment: 'сам' },
        actor,
      );
      expect(notificationsClient.emit).not.toHaveBeenCalled();
    });

    it('переход без комментария: пишет историю с comment null', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.stageTransitionRule.findUnique.mockResolvedValue(rule);
      prisma.user.findUnique.mockResolvedValue({ id: actor.id });
      prisma.deal.update.mockResolvedValue({
        ...baseDeal,
        status: 'to-be-agreed',
      });
      prisma.dealStageHistory.create.mockResolvedValue({ id: 'h-1' });

      const result = await service.changeStage(
        'deal-1',
        { targetStage: 'to-be-agreed' },
        actor,
      );

      expect(result.status).toBe('to-be-agreed');
      expect(createArgOf(prisma.dealStageHistory.create).data).toMatchObject({
        comment: null,
      });
    });
  });

  describe('updateMainComment', () => {
    it('бросает NotFoundException, если сделка не найдена', async () => {
      prisma.deal.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMainComment('missing', { comment: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('сохраняет комментарий и возвращает DTO', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.deal.update.mockResolvedValue({
        ...baseDeal,
        mainComment: 'Главный комментарий',
      });

      const result = await service.updateMainComment('deal-1', {
        comment: 'Главный комментарий',
      });

      expect(prisma.deal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deal-1' },
          data: { mainComment: 'Главный комментарий' },
        }),
      );
      expect(result.mainComment).toBe('Главный комментарий');
    });

    it('пустая строка очищает комментарий в NULL', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        ...baseDeal,
        mainComment: 'Старый',
      });
      prisma.deal.update.mockResolvedValue({ ...baseDeal, mainComment: null });

      const result = await service.updateMainComment('deal-1', {
        comment: '   ',
      });

      expect(prisma.deal.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { mainComment: null } }),
      );
      expect(result.mainComment).toBeNull();
    });
  });

  describe('updateResponsibles', () => {
    const alice = { id: 'user-alice' };
    const bob = { id: 'user-bob' };

    it('бросает NotFoundException, если сделка не найдена', async () => {
      prisma.deal.findUnique.mockResolvedValue(null);
      await expect(
        service.updateResponsibles('missing', { userIds: [alice.id] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('бросает NotFoundException на неизвестного пользователя', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.user.findMany.mockResolvedValue([alice]);
      await expect(
        service.updateResponsibles('deal-1', { userIds: [alice.id, bob.id] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('ставит состав и первого главным, убирает дубликаты', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.user.findMany.mockResolvedValue([alice, bob]);
      prisma.deal.update.mockResolvedValue({
        ...baseDeal,
        responsibleUserIds: [bob.id, alice.id],
        responsibleUserId: bob.id,
      });

      const result = await service.updateResponsibles('deal-1', {
        userIds: [bob.id, alice.id, bob.id],
      });

      expect(prisma.deal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deal-1' },
          data: {
            responsibleUserIds: [bob.id, alice.id],
            responsibleUserId: bob.id,
          },
        }),
      );
      expect(result.responsibleName).toBeNull();
    });

    it('пустой массив снимает всех ответственных', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.deal.update.mockResolvedValue({
        ...baseDeal,
        responsibleUserIds: [],
        responsibleUserId: null,
      });

      await service.updateResponsibles('deal-1', { userIds: [] });

      expect(prisma.deal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { responsibleUserIds: [], responsibleUserId: null },
        }),
      );
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('update — синхронизация ответственных', () => {
    it('смена главного через PATCH двигает его в начало списка', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        ...baseDeal,
        responsibleUserIds: ['user-resp', 'user-bob'],
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-bob' });
      prisma.deal.update.mockResolvedValue({
        ...baseDeal,
        responsibleUserId: 'user-bob',
        responsibleUserIds: ['user-bob', 'user-resp'],
      });

      await service.update('deal-1', { responsibleUserId: 'user-bob' });

      expect(prisma.deal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deal-1' },
          data: {
            responsibleUserId: 'user-bob',
            responsibleUserIds: ['user-bob', 'user-resp'],
          },
        }),
      );
    });
  });

  describe('create', () => {
    const dto = {
      name: 'Сделка',
      description: 'Достаточно длинное описание',
      price: 1000,
      customerId: customer.id,
      responsibleUserId: 'user-resp',
    };

    it('всегда создаёт на stage по умолчанию и не импортом', async () => {
      prisma.customer.findUnique.mockResolvedValue(customer);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-resp' });
      prisma.deal.create.mockResolvedValue(baseDeal);

      await service.create(dto);

      expect(createArgOf(prisma.deal.create).data).toMatchObject({
        status: 'todo',
        isImported: false,
        customerId: customer.id,
      });
    });

    it('создаёт нового клиента из newCustomer', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue(customer);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-resp' });
      prisma.deal.create.mockResolvedValue(baseDeal);

      await service.create({
        name: 'Сделка',
        description: 'Достаточно длинное описание',
        price: 1000,
        newCustomer: { name: 'Клиент', email: 'C@C.com' },
        responsibleUserId: 'user-resp',
      });

      expect(prisma.customer.create).toHaveBeenCalled();
      expect(createArgOf(prisma.customer.create).data).toMatchObject({
        email: 'c@c.com',
      });
      expect(createArgOf(prisma.deal.create).data).toMatchObject({
        customerId: customer.id,
      });
    });

    it('бросает ConflictException, если email нового клиента занят', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'other' });
      await expect(
        service.create({
          name: 'Сделка',
          description: 'Достаточно длинное описание',
          price: 1000,
          newCustomer: { name: 'Клиент', email: 'c@c.com' },
          responsibleUserId: 'user-resp',
        }),
      ).rejects.toThrow(/уже существует/);
      expect(prisma.deal.create).not.toHaveBeenCalled();
    });

    it('бросает BadRequestException без клиента и при обоих вариантах', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-resp' });
      await expect(
        service.create({
          name: 'Сделка',
          description: 'Достаточно длинное описание',
          price: 1000,
          responsibleUserId: 'user-resp',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create({
          ...dto,
          newCustomer: { name: 'Клиент', email: 'c@c.com' },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.deal.create).not.toHaveBeenCalled();
    });

    it('бросает NotFoundException на неизвестного клиента', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(prisma.deal.create).not.toHaveBeenCalled();
    });

    it('бросает NotFoundException на неизвестного ответственного', async () => {
      prisma.customer.findUnique.mockResolvedValue(customer);
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(prisma.deal.create).not.toHaveBeenCalled();
    });
  });

  describe('import', () => {
    it('создаёт на произвольном этапе с флагом импорта', async () => {
      prisma.customer.findUnique.mockResolvedValue(customer);
      prisma.user.findUnique.mockResolvedValue({ id: 'u' });
      prisma.deal.create.mockResolvedValue({
        ...baseDeal,
        status: 'in-progress',
        isImported: true,
        importedBy: 'user-admin',
      });

      const result = await service.import({
        name: 'Сделка',
        description: 'Достаточно длинное описание',
        price: 1000,
        customerId: customer.id,
        responsibleUserId: 'user-resp',
        status: 'in-progress',
        isImported: true,
        importedBy: 'user-admin',
      });

      expect(createArgOf(prisma.deal.create).data).toMatchObject({
        status: 'in-progress',
        isImported: true,
        importedBy: 'user-admin',
      });
      expect(result.isImported).toBe(true);
    });
  });

  describe('getAllowedTransitions', () => {
    it('возвращает только переходы, разрешённые роли', async () => {
      prisma.stageTransitionRule.findMany.mockResolvedValue([
        {
          fromStage: 'todo',
          toStage: 'to-be-agreed',
          allowedRoles: [Role.MANAGER],
        },
        {
          fromStage: 'in-progress',
          toStage: 'produced',
          allowedRoles: [Role.LOGIST],
        },
      ]);
      const result = await service.getAllowedTransitions({
        ...actor,
        role: Role.LOGIST,
      });
      expect(result).toEqual([
        { fromStage: 'in-progress', toStage: 'produced' },
      ]);
    });
  });

  describe('remove', () => {
    it('бросает NotFoundException, если сделки нет', async () => {
      prisma.deal.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('удаляет сделку и снимает напоминание о дедлайне', async () => {
      prisma.deal.findUnique.mockResolvedValue({ id: 'deal-1' });
      prisma.deal.delete.mockResolvedValue(baseDeal);
      await service.remove('deal-1');
      expect(prisma.deal.delete).toHaveBeenCalledWith({
        where: { id: 'deal-1' },
      });
      expect(remindersQueue.remove).toHaveBeenCalledWith(
        'deal-due-soon-deal-1',
      );
    });
  });

  describe('update — напоминания о дедлайне', () => {
    it('перепланирует напоминание при смене дедлайна', async () => {
      configService.get.mockReturnValue('redis://localhost:6379');
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-resp' });
      const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
      prisma.deal.update.mockResolvedValue({ ...baseDeal, deadline });

      await service.update('deal-1', { deadline: deadline.toISOString() });

      expect(remindersQueue.remove).toHaveBeenCalledWith(
        'deal-due-soon-deal-1',
      );
      expect(remindersQueue.add).toHaveBeenCalledWith(
        'due-soon',
        { dealId: 'deal-1' },
        expect.objectContaining({ jobId: 'deal-due-soon-deal-1' }),
      );
    });

    it('не трогает очередь без VALKEY_URL', async () => {
      prisma.deal.findUnique.mockResolvedValue(baseDeal);
      prisma.deal.update.mockResolvedValue(baseDeal);
      await service.update('deal-1', { description: 'Новое описание сделки' });
      expect(remindersQueue.add).not.toHaveBeenCalled();
      expect(remindersQueue.remove).not.toHaveBeenCalled();
    });
  });
});
