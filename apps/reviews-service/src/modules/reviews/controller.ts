import { Body, Controller, Post } from "@nestjs/common";
import { CreatedModel } from "src/lib/modules";

import { IReviewsRepository } from "./adapter";
import { ReviewsEntity } from "./entity";

@Controller("reviews")
export class ReviewsController {
  constructor(
    private readonly reviewsRepository: IReviewsRepository,
  ) {}

  @Post()
  async save(@Body() model: ReviewsEntity): Promise<CreatedModel> {
    return await this.reviewsRepository.create(model);
  }
}
