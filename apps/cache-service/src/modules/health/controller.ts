import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      status: "ok",
      service: "cache-service",
      instance: process.env.INSTANCE_ID || process.env.HOSTNAME || "unknown",
      timestamp: new Date().toISOString(),
    };
  }
}
