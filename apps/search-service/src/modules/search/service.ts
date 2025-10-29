import { Review, ReviewDocument } from "@daap/schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>
  ) {}

  async search(query: string, page = 1, size = 10) {
    const skip = (page - 1) * size;

    // Validate and sanitize query (minimal sanitization for MongoDB Text Search)
    const sanitizedQuery = query.trim();
    if (!sanitizedQuery) {
      return { items: [], total: 0 };
    }

    if (sanitizedQuery.length < 3) {
      // If the query is too short, we can return an empty result set
      return { items: [], total: 0 };
    }

    // Use MongoDB Text Search with text index
    // Searches across reviewText and summary fields (as defined in schema)
    const searchCriteria = {
      $text: { $search: sanitizedQuery }
    };

    // Query with text score for relevance sorting
    const [items, total] = await Promise.all([
      this.reviewModel
        .find(searchCriteria, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .skip(skip)
        .limit(size)
        .exec(),

      this.reviewModel.countDocuments(searchCriteria),
    ]);

    return { items, total };
  }
}
