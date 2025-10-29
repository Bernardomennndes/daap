#!/bin/bash

# MongoDB Text Index Creation Script
# Creates text search indexes directly in MongoDB using mongosh

echo "🔍 Creating MongoDB text search indexes..."

# MongoDB connection details
MONGO_CONTAINER="daap-mongodb"
MONGO_USER="admin"
MONGO_PASS="admin"
DB_NAME="daap"
COLLECTION="reviews"

# Check if MongoDB container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${MONGO_CONTAINER}$"; then
  echo "❌ Error: MongoDB container '${MONGO_CONTAINER}' is not running"
  echo "Start it with: docker-compose up -d mongodb"
  exit 1
fi

echo "✓ MongoDB container is running"

# Create the text index using mongosh
echo "Creating text search index on ${COLLECTION} collection..."

docker exec -i ${MONGO_CONTAINER} mongosh -u ${MONGO_USER} -p ${MONGO_PASS} --authenticationDatabase admin ${DB_NAME} <<'EOF'

// Check current collection stats
print("\n📊 Collection stats:");
const count = db.reviews.countDocuments();
print("Total documents:", count);

if (count === 0) {
  print("\n⚠️  Warning: Collection is empty. Index will be created but won't be used until documents are inserted.");
}

// Check for existing text indexes
print("\n🔎 Checking for existing text indexes...");
const indexes = db.reviews.getIndexes();
const textIndexes = indexes.filter(idx => idx.key._fts === 'text');

if (textIndexes.length > 0) {
  print("Found", textIndexes.length, "existing text index(es):");
  textIndexes.forEach(idx => {
    print("  - Name:", idx.name);
    print("    Weights:", JSON.stringify(idx.weights));
  });
  print("\nDropping old text indexes...");
  textIndexes.forEach(idx => {
    db.reviews.dropIndex(idx.name);
    print("✓ Dropped index:", idx.name);
  });
}

// Create the text index
print("\n🚀 Creating text search index...");
const startTime = Date.now();

db.reviews.createIndex(
  { reviewText: "text", summary: "text" },
  {
    default_language: "english",
    weights: {
      reviewText: 10,
      summary: 5
    },
    name: "text_search_index"
  }
);

const duration = Date.now() - startTime;
print(`✓ Text search index created successfully in ${duration}ms`);

// Verify the index was created
print("\n✅ Verifying index creation...");
const newIndexes = db.reviews.getIndexes();
const createdIndex = newIndexes.find(idx => idx.name === 'text_search_index');

if (createdIndex) {
  print("✓ Index verification successful:");
  print("  Name:", createdIndex.name);
  print("  Key:", JSON.stringify(createdIndex.key));
  print("  Weights:", JSON.stringify(createdIndex.weights));
  print("  Language:", createdIndex.default_language);
} else {
  print("❌ Index verification failed - index not found after creation");
  quit(1);
}

// Test the index with a sample query (if collection has data)
if (count > 0) {
  print("\n🧪 Testing index with sample query...");
  const testResult = db.reviews.find(
    { $text: { $search: "product" } },
    { score: { $meta: "textScore" } }
  ).limit(1).toArray();

  if (testResult.length > 0) {
    print("✓ Index is working correctly");
    print("  Sample match:");
    print("    Summary:", testResult[0].summary ? testResult[0].summary.substring(0, 50) + "..." : "N/A");
    print("    Score:", testResult[0].score);
  } else {
    print("⚠️  Test query returned no results (this may be normal if 'product' doesn't appear in any reviews)");
  }
}

print("\n✅ All operations completed successfully!");

EOF

echo ""
echo "✅ Text search index setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Rebuild packages: pnpm build"
echo "2. Restart services: docker-compose restart search-service"
echo "3. Test search: curl 'http://search.localhost/search?q=laptop&page=1&size=10'"
