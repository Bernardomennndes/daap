import { Document } from "mongoose";
export declare class Reviews {
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
export type ReviewDocument = Reviews & Document;
export declare const ReviewSchema: import("mongoose").Schema<Reviews, import("mongoose").Model<Reviews, any, any, any, Document<unknown, any, Reviews> & Reviews & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Reviews, Document<unknown, {}, import("mongoose").FlatRecord<Reviews>> & import("mongoose").FlatRecord<Reviews> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
//# sourceMappingURL=review.schema.d.ts.map