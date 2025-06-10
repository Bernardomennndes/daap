"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewSchema = exports.Reviews = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let Reviews = class Reviews {
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
exports.Reviews = Reviews;
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "reviewerID", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "asin", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "reviewerName", void 0);
__decorate([
    (0, mongoose_1.Prop)([Number])
], Reviews.prototype, "helpful", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "reviewText", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "overall", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "summary", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "unixReviewTime", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "reviewTime", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "category", void 0);
__decorate([
    (0, mongoose_1.Prop)()
], Reviews.prototype, "class", void 0);
exports.Reviews = Reviews = __decorate([
    (0, mongoose_1.Schema)({ collection: "reviews" })
], Reviews);
exports.ReviewSchema = mongoose_1.SchemaFactory.createForClass(Reviews);
