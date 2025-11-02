import { Review, ReviewDocument } from "@daap/schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  getTracingService,
  SEARCH_QUERY,
  SEARCH_RESULTS_TOTAL,
  SEARCH_RESULTS_RETURNED,
  SEARCH_MONGODB_COLLECTION,
} from '@daap/telemetry';

@Injectable()
export class SearchService {
  private readonly tracing = getTracingService('search-service');

  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>
  ) {}

  async search(query: string, page = 1, size = 10) {
    console.log(`[Search Service] Received search request: q="${query}", page=${page}, size=${size}`);

    return this.tracing.startActiveSpan('search.mongodb_query', async (span) => {
      const skip = (page - 1) * size;

      // Validate and sanitize query (minimal sanitization for MongoDB Text Search)
      const sanitizedQuery = query.trim();

      span.setAttributes({
        [SEARCH_QUERY]: sanitizedQuery,
        [SEARCH_MONGODB_COLLECTION]: 'reviews',
        'mongodb.operation': 'find',
      });

      if (!sanitizedQuery) {
        console.log(`[Search Service] Query is empty`);
        span.addEvent('query_empty');
        return { items: [], total: 0 };
      }

      if (sanitizedQuery.length < 3) {
        // If the query is too short, we can return an empty result set
        console.log(`[Search Service] Query too short: "${sanitizedQuery}"`);
        span.addEvent('query_too_short');
        return { items: [], total: 0 };
      }

      console.log(`[Search Service] Querying MongoDB with: "${sanitizedQuery}" (skip: ${skip}, limit: ${size})`)

      // Use MongoDB Text Search with text index
      // Searches across title and description fields (as defined in schema)
      const searchCriteria = {
        $text: { $search: sanitizedQuery }
      };

      // Query with text score for relevance sorting
      // MongoDB auto-instrumentation captura os queries
      const [items, total] = await Promise.all([
        this.reviewModel
          .find(searchCriteria, { score: { $meta: "textScore" } })
          .sort({ score: { $meta: "textScore" } })
          .skip(skip)
          .limit(size)
          .exec(),

        this.reviewModel.countDocuments(searchCriteria),
      ]);

      console.log(`[Search Service] MongoDB returned ${items.length} items (total: ${total})`);

      span.setAttributes({
        [SEARCH_RESULTS_TOTAL]: total,
        [SEARCH_RESULTS_RETURNED]: items.length,
      });

      return { items, total };
    });
  }
}
