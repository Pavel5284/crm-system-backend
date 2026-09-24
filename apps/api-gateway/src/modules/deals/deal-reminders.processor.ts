import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@app/database';
import { DEAL_EVENTS, DealDeadlineSoonEventPayload } from '@app/shared';

@Processor('deal-reminders')
export class DealRemindersProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATIONS_SERVICE')
    private readonly notificationsClient: ClientProxy,
  ) {
    super();
  }

  async process(job: Job<{ dealId: string }>) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: job.data.dealId },
      include: { customer: { select: { name: true } } },
    });
    if (
      !deal ||
      !deal.deadline ||
      !deal.responsibleUserId ||
      deal.status === 'done'
    ) {
      return;
    }

    const payload: DealDeadlineSoonEventPayload = {
      deal: {
        id: deal.id,
        name: deal.name,
        customerName: deal.customer.name,
        status: deal.status,
        responsibleUserId: deal.responsibleUserId,
        deadline: deal.deadline ? deal.deadline.toISOString() : null,
      },
      actorId: 'system',
    };
    this.notificationsClient.emit(DEAL_EVENTS.DEADLINE_SOON, payload);
  }
}
