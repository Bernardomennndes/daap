import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      status: "ok",
      service: "reviews-service",
      instance: process.env.INSTANCE_ID || process.env.HOSTNAME || "unknown",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
