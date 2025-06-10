import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ collection: "reviews" })
export class Review {
  @Prop()
  reviewerID: string;

  @Prop()
  asin: string;

  @Prop()
  reviewerName: string;

  @Prop([Number])
  helpful: number[];

  @Prop()
  reviewText: string;

  @Prop()
  overall: number;

  @Prop()
  summary: string;

  @Prop()
  unixReviewTime: number;

  @Prop()
  reviewTime: string;

  @Prop()
  category: string;

  @Prop()
  class: number;
}

export type ReviewDocument = Review & Document;
export const ReviewSchema = SchemaFactory.createForClass(Review);

// Create text index for full-text search
// ReviewSchema.index(
//   { reviewText: "text", summary: "text" },
//   { default_language: "english" }
// );

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
