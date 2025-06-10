import { Module } from "@nestjs/common";
import { MainDatabaseModule } from "src/lib/modules";
import { RedisModule } from "src/lib/modules/cache/module";
import { GlobalModule } from "src/lib/modules/global/module";

import { ReviewsModule } from "./reviews/module";
@Module({
  imports: [GlobalModule, ReviewsModule, MainDatabaseModule, RedisModule],
})
export class MainModule {}
