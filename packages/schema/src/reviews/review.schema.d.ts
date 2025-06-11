import { Document } from "mongoose";
export declare class Review {
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
export type ReviewDocument = Review & Document;
export declare const ReviewSchema: import("mongoose").Schema<Review, import("mongoose").Model<Review, any, any, any, Document<unknown, any, Review> & Review & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Review, Document<unknown, {}, import("mongoose").FlatRecord<Review>> & import("mongoose").FlatRecord<Review> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
//# sourceMappingURL=review.schema.d.ts.map