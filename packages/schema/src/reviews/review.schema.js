"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewSchema = exports.Review = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let Review = class Review {
    reviewerID;
    asin;
    reviewerName;
    helpful;
    reviewText;
    overall;
    summary;
    unixReviewTime;
    reviewTime;
    category;
    class;
};
exports.Review = Review;
__decorate([
    (0, mongoose_1.Prop)({ type: String })
], Review.prototype, "reviewerID", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String })
], Review.prototype, "asin", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String })
], Review.prototype, "reviewerName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Number] })
], Review.prototype, "helpful", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String })
], Review.prototype, "reviewText", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number })
], Review.prototype, "overall", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String })
], Review.prototype, "summary", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number })
], Review.prototype, "unixReviewTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String })
], Review.prototype, "reviewTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String })
], Review.prototype, "category", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number })
], Review.prototype, "class", void 0);
exports.Review = Review = __decorate([
    (0, mongoose_1.Schema)({ collection: "reviews" })
], Review);
exports.ReviewSchema = mongoose_1.SchemaFactory.createForClass(Review);
// Create text index for full-text search
exports.ReviewSchema.index({ reviewText: "text", summary: "text" }, {
    default_language: "english",
    weights: {
        reviewText: 10, // Higher weight for review text
        summary: 5 // Lower weight for summary
    },
    name: "text_search_index"
});
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
