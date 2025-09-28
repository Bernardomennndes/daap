#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class KeywordGenerator {
  constructor() {
    this.keywords = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../data/keywords.json'), 'utf8')
    );
    this.generatedQueries = new Set();
  }

  // Geração de queries simples (1 palavra)
  generateSingleWordQueries(count = 100) {
    const queries = [];
    const categories = this.keywords.categories;
    
    // Combinar todas as palavras de todas as categorias
    const allWords = [
      ...categories.quality.positive,
      ...categories.quality.negative,
      ...categories.experience.positive,
      ...categories.experience.negative,
      ...categories.service.positive,
      ...categories.service.negative,
      ...categories.value.positive,
      ...categories.value.negative,
      ...categories.features,
      ...categories.products,
      ...categories.brands,
      ...categories.emotions,
      ...categories.time_expressions,
      ...categories.comparisons,
      ...this.keywords.technical_terms
    ];

    for (let i = 0; i < count; i++) {
      const word = allWords[Math.floor(Math.random() * allWords.length)];
      if (!this.generatedQueries.has(word)) {
        queries.push(word);
        this.generatedQueries.add(word);
      }
    }

    return queries;
  }

  // Geração de queries compostas (2-3 palavras)
  generateCompositeQueries(count = 100) {
    const queries = [];
    const categories = this.keywords.categories;

    const combinations = [
      // Produto + Qualidade
      () => this.randomFrom(categories.products) + ' ' + this.randomFrom([...categories.quality.positive, ...categories.quality.negative]),
      
      // Marca + Produto
      () => this.randomFrom(categories.brands) + ' ' + this.randomFrom(categories.products),
      
      // Produto + Feature
      () => this.randomFrom(categories.products) + ' ' + this.randomFrom(categories.features),
      
      // Emoção + Produto
      () => this.randomFrom(categories.emotions) + ' ' + this.randomFrom(categories.products),
      
      // Experiência + Produto
      () => this.randomFrom([...categories.experience.positive, ...categories.experience.negative]) + ' ' + this.randomFrom(categories.products),
      
      // Valor + Produto  
      () => this.randomFrom([...categories.value.positive, ...categories.value.negative]) + ' ' + this.randomFrom(categories.products),
      
      // Marca + Qualidade
      () => this.randomFrom(categories.brands) + ' ' + this.randomFrom([...categories.quality.positive, ...categories.quality.negative]),
      
      // Produto + Serviço
      () => this.randomFrom(categories.products) + ' ' + this.randomFrom([...categories.service.positive, ...categories.service.negative])
    ];

    for (let i = 0; i < count; i++) {
      const generator = combinations[Math.floor(Math.random() * combinations.length)];
      const query = generator().toLowerCase();
      
      if (!this.generatedQueries.has(query)) {
        queries.push(query);
        this.generatedQueries.add(query);
      }
    }

    return queries;
  }

  // Geração de frases completas
  generatePhraseQueries(count = 50) {
    const queries = [];
    const phrases = this.keywords.common_phrases;

    for (let i = 0; i < count; i++) {
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      if (!this.generatedQueries.has(phrase)) {
        queries.push(phrase);
        this.generatedQueries.add(phrase);
      }
    }

    return queries;
  }

  // Geração de queries técnicas
  generateTechnicalQueries(count = 50) {
    const queries = [];
    const technical = this.keywords.technical_terms;
    const products = this.keywords.categories.products;

    for (let i = 0; i < count; i++) {
      const isCombo = Math.random() > 0.5;
      let query;
      
      if (isCombo) {
        query = this.randomFrom(products) + ' ' + this.randomFrom(technical);
      } else {
        query = this.randomFrom(technical);
      }
      
      if (!this.generatedQueries.has(query)) {
        queries.push(query);
        this.generatedQueries.add(query);
      }
    }

    return queries;
  }

  // Geração de queries raras (para testar cache miss)
  generateRareQueries(count = 25) {
    const queries = [];
    const prefixes = ['rare', 'unique', 'special', 'custom', 'unusual', 'weird', 'strange'];
    const products = this.keywords.categories.products;

    for (let i = 0; i < count; i++) {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const product = this.randomFrom(products);
      const query = `${prefix} ${product}`;
      
      if (!this.generatedQueries.has(query)) {
        queries.push(query);
        this.generatedQueries.add(query);
      }
    }

    return queries;
  }

  // Método auxiliar para seleção aleatória
  randomFrom(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  // Geração de conjunto completo de queries
  generateQuerySet(options = {}) {
    const {
      single = 200,
      composite = 300,
      phrases = 100,
      technical = 100,
      rare = 50,
      duplicateRatio = 0.2 // 20% de queries duplicadas para testar cache hit
    } = options;

    console.log('🔄 Generating query set...');
    
    const singleQueries = this.generateSingleWordQueries(single);
    const compositeQueries = this.generateCompositeQueries(composite);
    const phraseQueries = this.generatePhraseQueries(phrases);
    const technicalQueries = this.generateTechnicalQueries(technical);
    const rareQueries = this.generateRareQueries(rare);

    let allQueries = [
      ...singleQueries,
      ...compositeQueries,
      ...phraseQueries,
      ...technicalQueries,
      ...rareQueries
    ];

    // Adicionar queries duplicadas para simular cache hits
    const duplicateCount = Math.floor(allQueries.length * duplicateRatio);
    for (let i = 0; i < duplicateCount; i++) {
      const randomQuery = allQueries[Math.floor(Math.random() * allQueries.length)];
      allQueries.push(randomQuery);
    }

    // Embaralhar as queries
    allQueries = this.shuffleArray(allQueries);

    console.log(`✅ Generated ${allQueries.length} queries:`);
    console.log(`   - Single words: ${singleQueries.length}`);
    console.log(`   - Composite: ${compositeQueries.length}`);
    console.log(`   - Phrases: ${phraseQueries.length}`);
    console.log(`   - Technical: ${technicalQueries.length}`);
    console.log(`   - Rare: ${rareQueries.length}`);
    console.log(`   - Duplicates: ${duplicateCount}`);

    return {
      queries: allQueries,
      stats: {
        total: allQueries.length,
        unique: this.generatedQueries.size,
        duplicates: duplicateCount,
        categories: {
          single: singleQueries.length,
          composite: compositeQueries.length,
          phrases: phraseQueries.length,
          technical: technicalQueries.length,
          rare: rareQueries.length
        }
      }
    };
  }

  // Método auxiliar para embaralhar array
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Salvar queries em arquivo
  saveQueries(queries, filename = 'generated-queries.json') {
    const outputPath = path.join(__dirname, '../data', filename);
    const data = {
      generated_at: new Date().toISOString(),
      queries: queries.queries,
      stats: queries.stats
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`💾 Queries saved to: ${outputPath}`);
    return outputPath;
  }
}

// CLI Usage
if (require.main === module) {
  const generator = new KeywordGenerator();
  
  const args = process.argv.slice(2);
  const count = args[0] ? parseInt(args[0]) : 1000;
  
  console.log(`🚀 Generating ${count} search queries for load testing...`);
  
  // Calcular distribuição proporcional
  const distribution = {
    single: Math.floor(count * 0.3),     // 30% queries simples
    composite: Math.floor(count * 0.4),  // 40% queries compostas
    phrases: Math.floor(count * 0.15),   // 15% frases
    technical: Math.floor(count * 0.1),  // 10% técnicas
    rare: Math.floor(count * 0.05),      // 5% raras
    duplicateRatio: 0.2                  // 20% duplicadas
  };

  const querySet = generator.generateQuerySet(distribution);
  const outputFile = generator.saveQueries(querySet, `queries-${count}.json`);
  
  console.log('\n📊 Query Distribution:');
  console.log(`Total: ${querySet.stats.total}`);
  console.log(`Unique: ${querySet.stats.unique}`);
  console.log(`Cache hit simulation: ${querySet.stats.duplicates} duplicates`);
  
  console.log('\n🎯 Ready for load testing!');
  console.log(`Use: node load-test-runner.js ${outputFile}`);
}

module.exports = KeywordGenerator;
