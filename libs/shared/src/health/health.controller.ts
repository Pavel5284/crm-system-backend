import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { PrismaService } from "@app/database";
import { Public } from "../decorators/public.decorator";

@Public()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return { database: { status: "up" } };
      },
    ]);
  }
}
