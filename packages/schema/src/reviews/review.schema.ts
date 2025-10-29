import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ collection: "reviews" })
export class Review {
  @Prop({ type: String })
  reviewerID: string;

  @Prop({ type: String })
  asin: string;

  @Prop({ type: String })
  reviewerName: string;

  @Prop({ type: [Number] })
  helpful: number[];

  @Prop({ type: String })
  reviewText: string;

  @Prop({ type: Number })
  overall: number;

  @Prop({ type: String })
  summary: string;

  @Prop({ type: Number })
  unixReviewTime: number;

  @Prop({ type: String })
  reviewTime: string;

  @Prop({ type: String })
  category: string;

  @Prop({ type: Number })
  class: number;
}

export type ReviewDocument = Review & Document;
export const ReviewSchema = SchemaFactory.createForClass(Review);

// Create text index for full-text search
ReviewSchema.index(
  { reviewText: "text", summary: "text" },
  {
    default_language: "english",
    weights: {
      reviewText: 10,  // Higher weight for review text
      summary: 5       // Lower weight for summary
    },
    name: "text_search_index"
  }
);

// Add a compound index for performance optimization
// ReviewSchema.index(
//   { reviewerID: 1, asin: 1 },
//   { unique: true, background: true }
// );
// Add a TTL index for automatic deletion of old reviews
// ReviewSchema.index(
//   { unixReviewTime: 1 },
//   { expireAfterSeconds: 31536000 } // 1 year
// );
