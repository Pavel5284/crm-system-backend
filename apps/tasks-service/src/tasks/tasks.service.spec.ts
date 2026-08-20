import { Test } from "@nestjs/testing";
import { RpcException } from "@nestjs/microservices";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { getQueueToken } from "@nestjs/bullmq";
import { Role, TaskPriority, TaskStatus } from "@prisma/client";
import { PrismaService } from "@app/database";
import { TASK_EVENTS } from "@app/shared";
import { TasksService } from "./tasks.service";

describe("TasksService", () => {
  let service: TasksService;
  let prisma: {
    task: Record<
      "create" | "findUnique" | "findMany" | "count" | "update" | "delete",
      jest.Mock
    >;
    $transaction: jest.Mock;
  };
  let notificationsClient: { emit: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let remindersQueue: { add: jest.Mock };

  const baseTask = {
    id: "task-1",
    title: "Test",
    description: null,
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    dueDate: null,
    authorId: "user-author",
    assigneeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const requester = {
    id: "user-author",
    email: "a@a.com",
    role: Role.USER,
  };

  beforeEach(async () => {
    prisma = {
      task: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    notificationsClient = { emit: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn() };
    remindersQueue = { add: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: PrismaService,
          useValue: prisma as Record<string, unknown>,
        },
        { provide: "NOTIFICATIONS_SERVICE", useValue: notificationsClient },
        { provide: CACHE_MANAGER, useValue: cache },
        {
          provide: getQueueToken("task-reminders"),
          useValue: remindersQueue,
        },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  describe("findOne", () => {
    it("бросает RpcException, если задача не найдена", async () => {
      prisma.task.findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toThrow(RpcException);
    });

    it("возвращает задачу, если найдена", async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      await expect(service.findOne("task-1")).resolves.toEqual(baseTask);
    });
  });

  describe("create", () => {
    it("эмитит task.assigned, если сразу указан assigneeId", async () => {
      prisma.task.create.mockResolvedValue({
        ...baseTask,
        assigneeId: "user-assignee",
      });

      await service.create({
        title: "Test",
        assigneeId: "user-assignee",
        authorId: "user-author",
      });

      expect(notificationsClient.emit).toHaveBeenCalledWith(
        TASK_EVENTS.ASSIGNED,
        expect.objectContaining({ actorId: "user-author" }),
      );
    });

    it("не эмитит событий, если исполнитель не назначен", async () => {
      prisma.task.create.mockResolvedValue(baseTask);
      await service.create({ title: "Test", authorId: "user-author" });
      expect(notificationsClient.emit).not.toHaveBeenCalled();
    });
  });

  describe("update — авторизация", () => {
    it("разрешает автору изменить свою задачу", async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      prisma.task.update.mockResolvedValue({ ...baseTask, title: "Updated" });

      await expect(
        service.update("task-1", { title: "Updated" }, requester),
      ).resolves.toMatchObject({ title: "Updated" });
    });

    it("запрещает постороннему пользователю изменить чужую задачу", async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);

      await expect(
        service.update(
          "task-1",
          { title: "Hack" },
          { ...requester, id: "someone-else" },
        ),
      ).rejects.toThrow(RpcException);
    });

    it("разрешает ADMIN изменить любую задачу", async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      prisma.task.update.mockResolvedValue({ ...baseTask, title: "By admin" });

      await expect(
        service.update(
          "task-1",
          { title: "By admin" },
          { ...requester, id: "admin-id", role: Role.ADMIN },
        ),
      ).resolves.toMatchObject({ title: "By admin" });
    });

    it("эмитит task.assigned и task.completed при смене исполнителя и завершении", async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      prisma.task.update.mockResolvedValue({
        ...baseTask,
        assigneeId: "user-assignee",
        status: TaskStatus.DONE,
      });

      await service.update(
        "task-1",
        { assigneeId: "user-assignee", status: TaskStatus.DONE },
        requester,
      );

      expect(notificationsClient.emit).toHaveBeenCalledWith(
        TASK_EVENTS.ASSIGNED,
        expect.anything(),
      );
      expect(notificationsClient.emit).toHaveBeenCalledWith(
        TASK_EVENTS.COMPLETED,
        expect.anything(),
      );
    });
  });

  describe("remove", () => {
    it("удаляет задачу, если пользователь — автор", async () => {
      prisma.task.findUnique.mockResolvedValue(baseTask);
      prisma.task.delete.mockResolvedValue(baseTask);

      await expect(
        service.remove("task-1", requester),
      ).resolves.toBeUndefined();
      expect(prisma.task.delete).toHaveBeenCalledWith({
        where: { id: "task-1" },
      });
    });
  });
});
