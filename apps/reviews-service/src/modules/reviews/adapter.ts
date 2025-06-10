import { IRepository } from "src/lib/modules";
import { ReviewDocument } from "./schema";

export abstract class IReviewsRepository extends IRepository<ReviewDocument> {}
