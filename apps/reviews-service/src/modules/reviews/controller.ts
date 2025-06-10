/* eslint-disable security/detect-non-literal-regexp */
import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";
import { CreatedModel } from "src/lib/modules";
import { ICacheService } from "src/lib/modules/cache/adapter";

import { IReviewsRepository } from "./adapter";
import { ReviewsEntity } from "./entity";

@Controller("reviews")
export class ReviewsController {
  constructor(
    private readonly reviewsRepository: IReviewsRepository,
    @Inject(ICacheService)
    private readonly cacheService: ICacheService
  ) {}

  @Get()
  async find(@Query("q") query: string) {
    const cached = await this.cacheService.get(`review:${query}`);

    if (cached) return { reviews: JSON.parse(cached as string) };

    const regex = query ? new RegExp(query, "gi") : undefined;

    const reviews = await this.reviewsRepository.find(
      {
        reviewText: {
          $regex: regex,
        },
      },
      { limit: 100, skip: 0 }
    );

    await this.cacheService.set(`review:${query}`, JSON.stringify(reviews));

    return { reviews };
  }

  @Post()
  async save(@Body() model: ReviewsEntity): Promise<CreatedModel> {
    return await this.reviewsRepository.create(model);
  }
}
