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

    const sanitizedQuery = query.trim().replace(/[^a-zA-Z0-9\s]/g, "");
    if (!sanitizedQuery) {
      return { items: [], total: 0 };
    }

    if (sanitizedQuery.length < 3) {
      // If the query is too short, we can return an empty result set
      return { items: [], total: 0 };
    }

    // Create regex pattern for case-insensitive search
    const regexPattern = new RegExp(sanitizedQuery, "i");
    
    // Build search criteria using $or to search in multiple fields
    const searchCriteria = {
      $or: [
        { reviewText: { $regex: regexPattern } },
        { summary: { $regex: regexPattern } },
        { reviewerName: { $regex: regexPattern } },
        { category: { $regex: regexPattern } }
      ]
    };

    const [items, total] = await Promise.all([
      this.reviewModel
        .find(searchCriteria)
        .skip(skip)
        .limit(size)
        .exec(),

      this.reviewModel.countDocuments(searchCriteria),
    ]);

    return { items, total };
  }
}
