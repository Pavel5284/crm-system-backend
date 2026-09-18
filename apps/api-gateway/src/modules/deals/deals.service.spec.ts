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
    user: Record<'findUnique', jest.Mock>;
    stageTransitionRule: Record<'findUnique' | 'findMany', jest.Mock>;
    dealStageHistory: Record<'create', jest.Mock>;
    $transaction: jest.Mock;
  };
  let notificationsClient: { emit: jest.Mock };
  let remindersQueue: { add: jest.Mock; remove: jest.Mock };
  let configService: { get: jest.Mock };

  const customer = { id: 'customer-1', name: 'Клиент', email: 'c@c.com' };

  const baseDeal = {
    id: 'deal-1',
    name: 'Сделка',
    company: 'ООО Тест',
    description: 'Достаточно длинное описание',
    price: 1000,
    status: 'todo',
    customerId: customer.id,
    customer,
    responsibleUserId: 'user-resp',
    contactName: 'Иван',
    contactPhone: '+7 900 000-00-00',
    deadline: null,
    priority: DealPriority.MEDIUM,
    source: null,
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
    requiredFields: ['company', 'description', 'contactName'],
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
      user: { findUnique: jest.fn() },
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
        contactName: null,
        description: '',
      });
      prisma.stageTransitionRule.findUnique.mockResolvedValue(rule);
      const promise = service.changeStage(
        'deal-1',
        { targetStage: 'to-be-agreed', comment: 'x' },
        actor,
      );
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow(/contactName/);
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
  });

  describe('create', () => {
    const dto = {
      name: 'Сделка',
      company: 'ООО Тест',
      description: 'Достаточно длинное описание',
      price: 1000,
      customerEmail: 'c@c.com',
      customerName: 'Клиент',
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
      });
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
        company: 'ООО Тест',
        description: 'Достаточно длинное описание',
        price: 1000,
        customerEmail: 'c@c.com',
        customerName: 'Клиент',
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
      await service.update('deal-1', { company: 'ООО Новая' });
      expect(remindersQueue.add).not.toHaveBeenCalled();
      expect(remindersQueue.remove).not.toHaveBeenCalled();
    });
  });
});
