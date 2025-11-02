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
    title;
    description;
};
exports.Review = Review;
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true })
], Review.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true })
], Review.prototype, "description", void 0);
exports.Review = Review = __decorate([
    (0, mongoose_1.Schema)({ collection: "reviews" })
], Review);
exports.ReviewSchema = mongoose_1.SchemaFactory.createForClass(Review);
// Create text index for full-text search
exports.ReviewSchema.index({ title: "text", description: "text" }, {
    default_language: "english",
    weights: {
        description: 10, // Higher weight for description (main content)
        title: 5 // Lower weight for title
    },
    name: "text_search_index"
});
