import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ collection: "reviews" })
export class Review {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  description: string;
}

export type ReviewDocument = Review & Document;
export const ReviewSchema = SchemaFactory.createForClass(Review);

// Create text index for full-text search
ReviewSchema.index(
  { title: "text", description: "text" },
  {
    default_language: "english",
    weights: {
      description: 10,  // Higher weight for description (main content)
      title: 5          // Lower weight for title
    },
    name: "text_search_index"
  }
);
