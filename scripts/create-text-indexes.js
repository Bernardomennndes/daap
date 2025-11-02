#!/usr/bin/env node

/**
 * MongoDB Text Index Creation Script
 * Run this after schema changes to create text search indexes
 *
 * Usage: node scripts/create-text-indexes.js
 *
 * Environment variables:
 * - MONGO_URI: MongoDB connection string (default: mongodb://admin:admin@localhost:27017/daap?authSource=admin)
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:admin@localhost:27017/daap?authSource=admin';

async function createTextIndexes() {
  const client = new MongoClient(MONGO_URI);

  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('✓ Connected to MongoDB');

    const db = client.db('daap');
    const collection = db.collection('reviews');

    // Check if collection exists and has documents
    const count = await collection.countDocuments();
    console.log(`Found ${count} documents in reviews collection`);

    if (count === 0) {
      console.warn('⚠️  Warning: Collection is empty. Index will be created but won\'t be used until documents are inserted.');
    }

    // Check if text index already exists
    console.log('Checking for existing text indexes...');
    const indexes = await collection.indexes();
    const textIndexExists = indexes.some(idx => idx.name === 'text_search_index');

    if (textIndexExists) {
      console.log('Text index "text_search_index" already exists. Dropping it first...');
      await collection.dropIndex('text_search_index');
      console.log('✓ Old index dropped');
    }

    // Create text index
    console.log('Creating text search index...');
    const startTime = Date.now();

    await collection.createIndex(
      { title: "text", description: "text" },
      {
        default_language: "english",
        weights: {
          description: 10,
          title: 5
        },
        name: "text_search_index"
      }
    );

    const duration = Date.now() - startTime;
    console.log(`✓ Text search index created successfully in ${duration}ms`);

    // Verify index
    const newIndexes = await collection.indexes();
    const createdIndex = newIndexes.find(idx => idx.name === 'text_search_index');

    if (createdIndex) {
      console.log('\n✓ Index verification successful:');
      console.log('  Name:', createdIndex.name);
      console.log('  Key:', JSON.stringify(createdIndex.key));
      console.log('  Weights:', JSON.stringify(createdIndex.weights));
      console.log('  Language:', createdIndex.default_language);
    } else {
      console.error('✗ Index verification failed - index not found after creation');
      process.exit(1);
    }

    // Test the index with a sample query
    if (count > 0) {
      console.log('\nTesting index with sample query...');
      const testResult = await collection.find(
        { $text: { $search: "product" } },
        { score: { $meta: "textScore" } }
      ).limit(1).toArray();

      if (testResult.length > 0) {
        console.log('✓ Index is working correctly');
        console.log('  Sample match:', {
          title: testResult[0].title?.substring(0, 50) + '...',
          score: testResult[0].score
        });
      } else {
        console.log('⚠️  Test query returned no results (this may be normal if "product" doesn\'t appear in any reviews)');
      }
    }

    console.log('\n✓ All operations completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Rebuild search-service: pnpm --filter @daap/search-service build');
    console.log('2. Restart services: docker-compose restart search-service');
    console.log('3. Test search: curl "http://search.localhost/search?q=laptop&page=1&size=10"');

  } catch (error) {
    console.error('\n✗ Error creating text indexes:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure MongoDB is running: docker ps | grep mongodb');
    console.error('2. Check connection string: echo $MONGO_URI');
    console.error('3. Verify database exists: docker exec daap-mongodb mongosh -u admin -p admin');
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the script
createTextIndexes();
