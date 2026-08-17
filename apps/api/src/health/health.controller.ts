import { Controller, Get } from "@nestjs/common";

import { Public } from "../auth/auth.metadata";
import { HealthService, type HealthStatus } from "./health.service";

@Public()
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthStatus {
    return this.healthService.getStatus();
  }
}
