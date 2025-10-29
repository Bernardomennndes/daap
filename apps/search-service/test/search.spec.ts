import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SearchService } from '../src/modules/search/service';
import { Review } from '@daap/schema';

describe('SearchService - MongoDB Text Search', () => {
  let service: SearchService;
  let mockReviewModel: any;

  beforeEach(async () => {
    // Mock the Mongoose model with chainable methods
    mockReviewModel = {
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn(),
      countDocuments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getModelToken(Review.name),
          useValue: mockReviewModel,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Text Search Implementation', () => {
    it('should use $text search for valid queries', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('laptop', 1, 10);

      expect(mockReviewModel.find).toHaveBeenCalledWith(
        { $text: { $search: 'laptop' } },
        { score: { $meta: 'textScore' } }
      );
    });

    it('should sort results by text score (relevance)', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('camera', 1, 10);

      expect(mockReviewModel.sort).toHaveBeenCalledWith({
        score: { $meta: 'textScore' },
      });
    });

    it('should handle multi-word queries', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('laptop screen protector', 1, 10);

      expect(mockReviewModel.find).toHaveBeenCalledWith(
        { $text: { $search: 'laptop screen protector' } },
        { score: { $meta: 'textScore' } }
      );
    });

    it('should preserve special characters (MongoDB Text Search handles them)', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('C++ programming', 1, 10);

      // Unlike regex search, we don't strip special characters
      expect(mockReviewModel.find).toHaveBeenCalledWith(
        { $text: { $search: 'C++ programming' } },
        { score: { $meta: 'textScore' } }
      );
    });
  });

  describe('Query Validation', () => {
    it('should reject empty queries', async () => {
      const result = await service.search('', 1, 10);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockReviewModel.find).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only queries', async () => {
      const result = await service.search('   ', 1, 10);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockReviewModel.find).not.toHaveBeenCalled();
    });

    it('should reject queries shorter than 3 characters', async () => {
      const result = await service.search('ab', 1, 10);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockReviewModel.find).not.toHaveBeenCalled();
    });

    it('should accept queries with exactly 3 characters', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('abc', 1, 10);

      expect(mockReviewModel.find).toHaveBeenCalled();
    });
  });

  describe('Pagination', () => {
    it('should handle first page correctly (skip 0)', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(100);

      await service.search('smartphone', 1, 10);

      expect(mockReviewModel.skip).toHaveBeenCalledWith(0); // (1-1) * 10
      expect(mockReviewModel.limit).toHaveBeenCalledWith(10);
    });

    it('should handle pagination correctly (page 3, size 20)', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(100);

      await service.search('smartphone', 3, 20);

      expect(mockReviewModel.skip).toHaveBeenCalledWith(40); // (3-1) * 20
      expect(mockReviewModel.limit).toHaveBeenCalledWith(20);
    });

    it('should handle large page sizes', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(1000);

      await service.search('product', 5, 100);

      expect(mockReviewModel.skip).toHaveBeenCalledWith(400); // (5-1) * 100
      expect(mockReviewModel.limit).toHaveBeenCalledWith(100);
    });
  });

  describe('Results Handling', () => {
    it('should return items and total count', async () => {
      const mockItems = [
        { reviewText: 'Great laptop', summary: 'Excellent', score: 1.5 },
        { reviewText: 'Good laptop', summary: 'Nice', score: 1.2 },
      ];

      mockReviewModel.exec.mockResolvedValue(mockItems);
      mockReviewModel.countDocuments.mockResolvedValue(42);

      const result = await service.search('laptop', 1, 10);

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(42);
    });

    it('should handle empty results', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      const result = await service.search('nonexistent', 1, 10);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should execute find and countDocuments in parallel', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('test', 1, 10);

      // Both should be called (Promise.all behavior)
      expect(mockReviewModel.find).toHaveBeenCalled();
      expect(mockReviewModel.countDocuments).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle queries with leading/trailing whitespace', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('  laptop  ', 1, 10);

      // Should trim the query
      expect(mockReviewModel.find).toHaveBeenCalledWith(
        { $text: { $search: 'laptop' } },
        { score: { $meta: 'textScore' } }
      );
    });

    it('should handle default pagination parameters', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('test');

      expect(mockReviewModel.skip).toHaveBeenCalledWith(0); // page=1
      expect(mockReviewModel.limit).toHaveBeenCalledWith(10); // size=10
    });

    it('should handle queries with numbers', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('iPhone 15', 1, 10);

      expect(mockReviewModel.find).toHaveBeenCalledWith(
        { $text: { $search: 'iPhone 15' } },
        { score: { $meta: 'textScore' } }
      );
    });

    it('should handle queries with punctuation', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('5-star rating!', 1, 10);

      // Text search handles punctuation naturally
      expect(mockReviewModel.find).toHaveBeenCalledWith(
        { $text: { $search: '5-star rating!' } },
        { score: { $meta: 'textScore' } }
      );
    });
  });

  describe('MongoDB Text Search Features', () => {
    it('should support phrase search with quotes', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('"excellent camera quality"', 1, 10);

      expect(mockReviewModel.find).toHaveBeenCalledWith(
        { $text: { $search: '"excellent camera quality"' } },
        { score: { $meta: 'textScore' } }
      );
    });

    it('should support exclusion with minus operator', async () => {
      mockReviewModel.exec.mockResolvedValue([]);
      mockReviewModel.countDocuments.mockResolvedValue(0);

      await service.search('smartphone -samsung', 1, 10);

      expect(mockReviewModel.find).toHaveBeenCalledWith(
        { $text: { $search: 'smartphone -samsung' } },
        { score: { $meta: 'textScore' } }
      );
    });
  });
});
