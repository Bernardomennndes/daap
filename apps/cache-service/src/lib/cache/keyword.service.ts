import { Injectable } from '@nestjs/common';
import natural from 'natural';

@Injectable()
export class KeywordService {
  // ✅ SOLUÇÃO 3: Porter Stemmer para normalização morfológica
  private readonly stemmer = natural.PorterStemmer;

  private readonly stopWords = new Set([
    // English stop words
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'can', 'could', 'may', 'might', 'must', 'shall',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when',
    'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'now',
    // Portuguese stop words
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do',
    'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com',
    'sem', 'sob', 'sobre', 'e', 'ou', 'mas', 'se', 'que', 'como', 'quando',
    'onde', 'porque', 'porquê', 'qual', 'quais', 'quem', 'este', 'esta',
    'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela',
    'aqueles', 'aquelas', 'isto', 'isso', 'aquilo', 'meu', 'minha', 'meus',
    'minhas', 'teu', 'tua', 'teus', 'tuas', 'seu', 'sua', 'seus', 'suas',
    'nosso', 'nossa', 'nossos', 'nossas', 'vosso', 'vossa', 'vossos', 'vossas',
    'todo', 'toda', 'todos', 'todas', 'muito', 'muita', 'muitos', 'muitas',
    'pouco', 'pouca', 'poucos', 'poucas', 'mais', 'menos', 'bem', 'mal',
    'já', 'ainda', 'sempre', 'nunca', 'também', 'só', 'apenas', 'depois',
    'antes', 'agora', 'hoje', 'ontem', 'amanhã', 'sim', 'não', 'talvez'
  ]);

  private readonly minKeywordLength = 3;

  /**
   * ✅ SOLUÇÃO 3: Aplica stemming para normalizar variações morfológicas
   * Ex: "laptops" → "laptop", "charging" → "charg"
   */
  private stemWord(word: string): string {
    return this.stemmer.stem(word);
  }

  /**
   * Extrai keywords relevantes de uma query com stemming aplicado
   * Remove stop words, pontuação, normaliza e aplica stemming
   */
  extractKeywords(query: string): string[] {
    if (!query || typeof query !== 'string') {
      return [];
    }

    return query
      .toLowerCase()
      .replace(/[^\w\sàáâãèéêìíòóôõùúç]/g, ' ') // Remove pontuação, mantém acentos
      .split(/\s+/)
      .map(word => word.trim())
      .filter(word =>
        word.length >= this.minKeywordLength &&
        !this.stopWords.has(word)
      )
      .map(word => this.stemWord(word))  // ✅ APLICA STEMMING
      .filter((word, index, self) => self.indexOf(word) === index); // Remove duplicatas
  }

  /**
   * Calcula score de similaridade entre duas listas de keywords (Jaccard similarity)
   * Retorna um valor entre 0 (sem similaridade) e 1 (idênticas)
   */
  calculateSimilarity(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 && keywords2.length === 0) {
      return 1;
    }
    
    if (keywords1.length === 0 || keywords2.length === 0) {
      return 0;
    }

    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = new Set([...set1].filter(k => set2.has(k)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Normaliza keyword para agrupamento
   * Remove acentos e converte para lowercase
   */
  normalizeKeyword(keyword: string): string {
    return keyword
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remove acentos
  }

  /**
   * Calcula um score combinado baseado em frequência de keywords
   * Keywords mais frequentes geram scores maiores
   */
  calculateKeywordScore(keywords: string[], keywordFrequencies: Map<string, number>): number {
    if (keywords.length === 0) {
      return 0;
    }

    let totalScore = 0;
    for (const keyword of keywords) {
      const frequency = keywordFrequencies.get(keyword) || 0;
      totalScore += frequency;
    }

    return totalScore / keywords.length; // Score médio
  }

  /**
   * Agrupa keywords similares
   */
  groupSimilarKeywords(keywordsList: string[][]): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    
    for (const keywords of keywordsList) {
      const normalized = keywords.map(k => this.normalizeKeyword(k));
      const key = normalized.sort().join('|');
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(...keywords);
    }

    return groups;
  }

  /**
   * Verifica se uma query contém keywords relevantes
   */
  hasRelevantKeywords(query: string): boolean {
    const keywords = this.extractKeywords(query);
    return keywords.length > 0;
  }

  /**
   * Extrai a keyword mais significativa (mais longa) de uma lista
   */
  getMostSignificantKeyword(keywords: string[]): string | null {
    if (keywords.length === 0) {
      return null;
    }

    return keywords.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    );
  }
}
