import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ collection: "reviews" })
export class Reviews {
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

export type ReviewDocument = Reviews & Document;
export const ReviewSchema = SchemaFactory.createForClass(Reviews);
