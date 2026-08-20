import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Server } from "http";
import { NotificationsServiceModule } from "./../src/notifications-service.module";

describe("NotificationsServiceController (e2e)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [NotificationsServiceModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it("/ (GET)", () => {
    return request(app.getHttpServer() as Server)
      .get("/")
      .expect(200)
      .expect("Hello World!");
  });
});
