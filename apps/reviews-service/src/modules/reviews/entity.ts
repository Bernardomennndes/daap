import { Reviews } from "./schema";

export class ReviewsEntity implements Reviews {
  reviewerID: string;

  asin: string;

  reviewerName: string;

  helpful: number[];

  reviewText: string;

  overall: number;

  summary: string;

  unixReviewTime: number;

  reviewTime: string;

  category: string;

  class: number;
}
