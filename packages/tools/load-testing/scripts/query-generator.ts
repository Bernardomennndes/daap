#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { Command } from "commander";

export class KeywordGenerator {
  keywords: any;
  generatedQueries: Set<string>;

  constructor() {
    this.keywords = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../data/keywords.json"), "utf8")
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
      ...this.keywords.technical_terms,
    ];

    const uniqueQueries = new Set<string>();
    
    // Primeiro, adicionar todas as palavras únicas
    allWords.forEach(word => {
      if (uniqueQueries.size < count) {
        uniqueQueries.add(word);
      }
    });

    // Se ainda precisamos de mais queries, permitir duplicatas
    while (queries.length < count) {
      const word = allWords[Math.floor(Math.random() * allWords.length)];
      queries.push(word);
    }

    // Se temos queries únicas suficientes, usar apenas elas
    if (uniqueQueries.size >= count) {
      return Array.from(uniqueQueries).slice(0, count);
    }

    return queries;
  }

  // Geração de queries compostas (2-3 palavras)
  generateCompositeQueries(count = 100) {
    const queries = [];
    const categories = this.keywords.categories;

    const combinations = [
      // Produto + Qualidade
      () =>
        this.randomFrom(categories.products) +
        " " +
        this.randomFrom([
          ...categories.quality.positive,
          ...categories.quality.negative,
        ]),

      // Marca + Produto
      () =>
        this.randomFrom(categories.brands) +
        " " +
        this.randomFrom(categories.products),

      // Produto + Feature
      () =>
        this.randomFrom(categories.products) +
        " " +
        this.randomFrom(categories.features),

      // Emoção + Produto
      () =>
        this.randomFrom(categories.emotions) +
        " " +
        this.randomFrom(categories.products),

      // Experiência + Produto
      () =>
        this.randomFrom([
          ...categories.experience.positive,
          ...categories.experience.negative,
        ]) +
        " " +
        this.randomFrom(categories.products),

      // Valor + Produto
      () =>
        this.randomFrom([
          ...categories.value.positive,
          ...categories.value.negative,
        ]) +
        " " +
        this.randomFrom(categories.products),

      // Marca + Qualidade
      () =>
        this.randomFrom(categories.brands) +
        " " +
        this.randomFrom([
          ...categories.quality.positive,
          ...categories.quality.negative,
        ]),

      // Produto + Serviço
      () =>
        this.randomFrom(categories.products) +
        " " +
        this.randomFrom([
          ...categories.service.positive,
          ...categories.service.negative,
        ]),

      // Combinações de 3 palavras
      () =>
        this.randomFrom(categories.brands) +
        " " +
        this.randomFrom(categories.products) +
        " " +
        this.randomFrom(categories.features),

      // Feature + Qualidade + Produto
      () =>
        this.randomFrom(categories.features) +
        " " +
        this.randomFrom([
          ...categories.quality.positive,
          ...categories.quality.negative,
        ]) +
        " " +
        this.randomFrom(categories.products),

      // Emoção + Marca + Produto
      () =>
        this.randomFrom(categories.emotions) +
        " " +
        this.randomFrom(categories.brands) +
        " " +
        this.randomFrom(categories.products),
    ];

    // Gerar queries sem verificação de duplicatas para atingir o count
    for (let i = 0; i < count; i++) {
      const generator =
        combinations[Math.floor(Math.random() * combinations.length)];
      const query = generator().toLowerCase();
      queries.push(query);
    }

    return queries;
  }

  // Geração de frases completas
  generatePhraseQueries(count = 50) {
    const queries = [];
    const phrases = this.keywords.common_phrases;

    // Gerar queries permitindo duplicatas para atingir o count
    for (let i = 0; i < count; i++) {
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      queries.push(phrase);
    }

    return queries;
  }

  // Geração de queries técnicas
  generateTechnicalQueries(count = 50) {
    const queries = [];
    const technical = this.keywords.technical_terms;
    const products = this.keywords.categories.products;
    const features = this.keywords.categories.features;

    for (let i = 0; i < count; i++) {
      const combinationType = Math.random();
      let query;

      if (combinationType < 0.33) {
        // Produto + Termo técnico
        query = this.randomFrom(products) + " " + this.randomFrom(technical);
      } else if (combinationType < 0.66) {
        // Feature + Termo técnico
        query = this.randomFrom(features) + " " + this.randomFrom(technical);
      } else {
        // Apenas termo técnico
        query = this.randomFrom(technical);
      }

      queries.push(query);
    }

    return queries;
  }

  // Geração de queries raras (para testar cache miss)
  generateRareQueries(count = 25) {
    const queries = [];
    const prefixes = [
      "rare", "unique", "special", "custom", "unusual", "weird", "strange",
      "exotic", "limited", "exclusive", "premium", "deluxe", "vintage", 
      "retro", "modern", "classic", "innovative", "advanced", "basic",
      "mini", "compact", "large", "mega", "ultra", "super", "hyper"
    ];
    const products = this.keywords.categories.products;
    const suffixes = [
      "edition", "version", "model", "series", "collection", "variant",
      "style", "type", "design", "format", "size", "color", "finish"
    ];

    for (let i = 0; i < count; i++) {
      const queryType = Math.random();
      let query;

      if (queryType < 0.5) {
        // Prefix + Produto
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const product = this.randomFrom(products);
        query = `${prefix} ${product}`;
      } else {
        // Produto + Suffix
        const product = this.randomFrom(products);
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        query = `${product} ${suffix}`;
      }

      queries.push(query);
    }

    return queries;
  }

  // Geração de queries numéricas (para grande volume)
  generateNumericQueries(count = 100) {
    const queries = [];
    const categories = this.keywords.categories;
    const numbers = Array.from({length: 1000}, (_, i) => (i + 1).toString());
    
    for (let i = 0; i < count; i++) {
      const queryType = Math.random();
      let query;

      if (queryType < 0.3) {
        // Produto + Número
        query = `${this.randomFrom(categories.products)} ${this.randomFrom(numbers)}`;
      } else if (queryType < 0.6) {
        // Marca + Número
        query = `${this.randomFrom(categories.brands)} ${this.randomFrom(numbers)}`;
      } else {
        // Feature + Número
        query = `${this.randomFrom(categories.features)} ${this.randomFrom(numbers)}`;
      }

      queries.push(query);
    }

    return queries;
  }

  // Geração de queries com variações de sufixos
  generateVariationQueries(count = 100) {
    const queries = [];
    const categories = this.keywords.categories;
    const variations = ['s', 'ed', 'ing', 'er', 'est', 'ly', 'ness', 'tion', 'able', 'ful'];
    
    const baseWords = [
      ...categories.quality.positive,
      ...categories.quality.negative,
      ...categories.experience.positive,
      ...categories.experience.negative,
    ];

    for (let i = 0; i < count; i++) {
      const baseWord = this.randomFrom(baseWords);
      const variation = this.randomFrom(variations);
      const product = this.randomFrom(categories.products);
      
      // Alternar entre palavra variada + produto ou só palavra variada
      if (Math.random() > 0.5) {
        queries.push(`${baseWord}${variation} ${product}`);
      } else {
        queries.push(`${baseWord}${variation}`);
      }
    }

    return queries;
  }

  // Geração de queries com combinações aleatórias extensas
  generateRandomCombinations(count = 100) {
    const queries = [];
    const categories = this.keywords.categories;
    
    // Criar um pool grande de todas as palavras
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
      ...this.keywords.technical_terms,
      ...this.keywords.common_phrases
    ];

    for (let i = 0; i < count; i++) {
      const wordCount = Math.floor(Math.random() * 4) + 1; // 1-4 palavras
      const words = [];
      
      for (let j = 0; j < wordCount; j++) {
        words.push(this.randomFrom(allWords));
      }
      
      queries.push(words.join(' ').toLowerCase());
    }

    return queries;
  }

  // Método auxiliar para seleção aleatória
  randomFrom(array: string[]) {
    return array[Math.floor(Math.random() * array.length)];
  }

  // Geração de conjunto completo de queries
  generateQuerySet(options: {
    single?: number;
    composite?: number;
    phrases?: number;
    technical?: number;
    rare?: number;
    numeric?: number;
    variations?: number;
    randomCombinations?: number;
    duplicateRatio?: number;
  }) {
    const {
      single = 200,
      composite = 300,
      phrases = 100,
      technical = 100,
      rare = 50,
      numeric = 0,
      variations = 0,
      randomCombinations = 0,
      duplicateRatio = 0.2, // 20% de queries duplicadas para testar cache hit
    } = options;

    console.log("🔄 Generating query set...");

    const singleQueries = this.generateSingleWordQueries(single);
    const compositeQueries = this.generateCompositeQueries(composite);
    const phraseQueries = this.generatePhraseQueries(phrases);
    const technicalQueries = this.generateTechnicalQueries(technical);
    const rareQueries = this.generateRareQueries(rare);
    const numericQueries = numeric > 0 ? this.generateNumericQueries(numeric) : [];
    const variationQueries = variations > 0 ? this.generateVariationQueries(variations) : [];
    const randomQueries = randomCombinations > 0 ? this.generateRandomCombinations(randomCombinations) : [];

    let allQueries = [
      ...singleQueries,
      ...compositeQueries,
      ...phraseQueries,
      ...technicalQueries,
      ...rareQueries,
      ...numericQueries,
      ...variationQueries,
      ...randomQueries,
    ];

    // Adicionar queries duplicadas para simular cache hits
    const duplicateCount = Math.floor(allQueries.length * duplicateRatio);
    for (let i = 0; i < duplicateCount; i++) {
      const randomQuery =
        allQueries[Math.floor(Math.random() * allQueries.length)];
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
    if (numericQueries.length > 0) console.log(`   - Numeric: ${numericQueries.length}`);
    if (variationQueries.length > 0) console.log(`   - Variations: ${variationQueries.length}`);
    if (randomQueries.length > 0) console.log(`   - Random combinations: ${randomQueries.length}`);
    console.log(`   - Duplicates: ${duplicateCount}`);

    return {
      queries: allQueries,
      stats: {
        total: allQueries.length,
        unique: new Set(allQueries).size,
        duplicates: duplicateCount,
        categories: {
          single: singleQueries.length,
          composite: compositeQueries.length,
          phrases: phraseQueries.length,
          technical: technicalQueries.length,
          rare: rareQueries.length,
          numeric: numericQueries.length,
          variations: variationQueries.length,
          randomCombinations: randomQueries.length,
        },
      },
    };
  }

  // Método auxiliar para embaralhar array
  shuffleArray(array: string[]) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Salvar queries em arquivo
  saveQueries(
    queries: { queries: string[]; stats: any },
    filename = "generated-queries.json"
  ) {
    const outputPath = path.join(__dirname, "../data", filename);
    const data = {
      generated_at: new Date().toISOString(),
      queries: queries.queries,
      stats: queries.stats,
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`💾 Queries saved to: ${outputPath}`);
    return outputPath;
  }
}

// CLI com Commander
if (require.main === module) {
  const program = new Command();

  program
    .name('query-generator')
    .description('Gerador de queries de busca para testes de carga em serviços de cache')
    .version('1.0.0')
    .argument('[count]', 'Número de queries a gerar', '1000')
    .option('-o, --output <filename>', 'Nome do arquivo de saída (sem extensão)')
    .option('--simple <percent>', 'Porcentagem de queries simples (0-100)', '25')
    .option('--composite <percent>', 'Porcentagem de queries compostas (0-100)', '35')
    .option('--phrases <percent>', 'Porcentagem de frases (0-100)', '15')
    .option('--duplicates <ratio>', 'Razão de queries duplicadas (0-1)', '0.2')
    .addHelpText('after', `

Exemplos:
  $ query-generator 1000                    Gera 1000 queries com distribuição padrão
  $ query-generator 5000 -o custom-queries  Gera 5000 queries em arquivo custom
  $ query-generator 10000 --duplicates 0.3  Gera 10000 com 30% duplicadas

Distribuição automática:
  - Volumes ≤10k: Distribuição balanceada para testes rápidos
  - Volumes >10k: Distribuição otimizada com mais variações

Tipos de queries geradas:
  • Single: Queries de uma palavra (ex: "quality", "service")
  • Composite: Queries compostas (ex: "good smartphone", "expensive hotel")
  • Phrases: Frases completas (ex: "I love this product")
  • Technical: Termos técnicos (ex: "API integration", "performance")
  • Rare: Combinações raras e incomuns
  • Numeric: Queries com números (ex: "2 years", "5 stars")
  • Variations: Variações de queries existentes
  • Random: Combinações aleatórias

Arquivos de saída:
  Salvos em: packages/tools/load-testing/data/queries-<count>.json
    `)
    .action((count: string, options) => {
      const generator = new KeywordGenerator();
      const queryCount = parseInt(count);

      console.log(`🚀 Generating ${queryCount} search queries for load testing...`);

      // Calcular distribuição proporcional baseada no volume
      let distribution;
      
      if (queryCount <= 10000) {
        // Distribuição padrão para volumes menores
        distribution = {
          single: Math.floor(queryCount * 0.25), // 25% queries simples
          composite: Math.floor(queryCount * 0.35), // 35% queries compostas
          phrases: Math.floor(queryCount * 0.15), // 15% frases
          technical: Math.floor(queryCount * 0.10), // 10% técnicas
          rare: Math.floor(queryCount * 0.05), // 5% raras
          numeric: Math.floor(queryCount * 0.10), // 10% numéricas
          variations: 0,
          randomCombinations: 0,
          duplicateRatio: parseFloat(options.duplicates) || 0.2,
        };
      } else {
        // Distribuição para volumes grandes (>10k)
        distribution = {
          single: Math.floor(queryCount * 0.15), // 15% queries simples
          composite: Math.floor(queryCount * 0.25), // 25% queries compostas
          phrases: Math.floor(queryCount * 0.10), // 10% frases
          technical: Math.floor(queryCount * 0.10), // 10% técnicas
          rare: Math.floor(queryCount * 0.05), // 5% raras
          numeric: Math.floor(queryCount * 0.15), // 15% numéricas
          variations: Math.floor(queryCount * 0.10), // 10% variações
          randomCombinations: Math.floor(queryCount * 0.10), // 10% combinações aleatórias
          duplicateRatio: parseFloat(options.duplicates) || 0.3,
        };
      }

      const querySet = generator.generateQuerySet(distribution);
      const filename = options.output 
        ? `${options.output}.json` 
        : `queries-${queryCount}.json`;
      const outputFile = generator.saveQueries(querySet, filename);

      console.log("\n📊 Query Distribution:");
      console.log(`Total: ${querySet.stats.total}`);
      console.log(`Unique: ${querySet.stats.unique}`);
      console.log(`Cache hit simulation: ${querySet.stats.duplicates} duplicates`);

      console.log("\n🎯 Ready for load testing!");
      console.log(`Use: node load-test-runner.js ${outputFile}`);
    });

  program.parse();
}
