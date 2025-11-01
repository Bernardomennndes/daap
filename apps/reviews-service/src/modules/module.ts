import { Module } from "@nestjs/common";
import { MainDatabaseModule } from "src/lib/modules";
import { GlobalModule } from "src/lib/modules/global/module";

import { ReviewsModule } from "./reviews/module";
import { HealthModule } from "./health/module";

@Module({
  imports: [GlobalModule, ReviewsModule, HealthModule, MainDatabaseModule],
})
export class MainModule {}
