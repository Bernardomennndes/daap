import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Repository } from 'src/lib/modules';
import { Model } from 'mongoose';

import { IReviewsRepository } from './adapter';
import { ReviewDocument, Reviews } from './schema';

@Injectable()
export class ReviewsRepository extends Repository<ReviewDocument> implements IReviewsRepository {
  constructor(@InjectModel(Reviews.name) private readonly entity: Model<ReviewDocument>) {
    super(entity);
  }
}
