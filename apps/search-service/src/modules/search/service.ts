import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ReviewModel, ReviewDocument } from "./review.schema";

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(ReviewModel.name) private readonly reviewModel: Model<ReviewDocument>
  ) {}

  async search(query: string, page = 1, size = 10) {
    const skip = (page - 1) * size;

    const [items, total] = await Promise.all([
      this.reviewModel
        .find(
          { $text: { $search: query, $language: "portuguese" } },
          { score: { $meta: "textScore" } }
        )
        .sort({ score: { $meta: "textScore" } })
        .skip(skip)
        .limit(size)
        .exec(),
      this.reviewModel.countDocuments({
        $text: { $search: query, $language: "portuguese" },
      }),
    ]);

    return { items, total };
  }
}
