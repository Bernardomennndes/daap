import { Module } from "@nestjs/common";
// import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { getConnectionToken } from "@nestjs/mongoose";
import { TokenModule } from "src/lib/modules/auth/token/module";
import { RedisModule } from "src/lib/modules/cache/module";
import { ConnectionName } from "src/lib/modules/database/enum";
import { HttpModule } from "src/lib/modules/http/module";
// import { IsLoggedMiddleware } from 'libs/utils/middleware/auth/is-logged.middleware';
import { Connection, Model } from "mongoose";

import { IReviewsRepository } from "./adapter";
import { ReviewsController } from "./controller";
import { ReviewsRepository } from "./repository";
import { ReviewDocument, Reviews, ReviewSchema } from "./schema";

@Module({
  imports: [TokenModule, HttpModule, RedisModule],
  controllers: [ReviewsController],
  providers: [
    {
      provide: IReviewsRepository,
      useFactory: (connection: Connection) =>
        new ReviewsRepository(
          connection.model(
            Reviews.name,
            ReviewSchema
          ) as unknown as Model<ReviewDocument>
        ),
      inject: [getConnectionToken(ConnectionName.MAIN)],
    },
  ],
  exports: [IReviewsRepository],
})
export class ReviewsModule {}
// export class ReviewsModule implements NestModule {
//   configure(consumer: MiddlewareConsumer): void {
//     consumer.apply(IsLoggedMiddleware).forRoutes({ path: '/reviews', method: RequestMethod.ALL });
//   }
// }
