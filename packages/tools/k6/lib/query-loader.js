/**
 * Query Context Loader for K6 Tests
 *
 * Loads query datasets from context-specific configurations.
 * Supports multiple domains (electronics, game soundtracks, etc.)
 *
 * Usage:
 *   import { loadQueryContext } from './lib/query-loader.js';
 *
 *   const queries = loadQueryContext('electronics');
 *   // or use environment variable
 *   const queries = loadQueryContext(__ENV.QUERY_CONTEXT || 'electronics');
 */

import { SharedArray } from 'k6/data';

/**
 * Load all query contexts from the JSON file
 * We cannot use SharedArray for objects, so we load directly
 */
const data = open('../data/query-contexts.json');
const allContexts = JSON.parse(data);

/**
 * Current active context (set via loadQueryContext)
 */
let activeContext = null;

/**
 * Load a specific query context
 *
 * @param {string} contextName - Name of the context (e.g., 'electronics', 'game_soundtracks')
 * @returns {object} Context object with popular, longTail, and uniqueWords arrays
 * @throws {Error} If context doesn't exist
 */
export function loadQueryContext(contextName = 'electronics') {
  if (!allContexts[contextName]) {
    const available = Object.keys(allContexts).join(', ');
    throw new Error(
      `Query context "${contextName}" not found. Available contexts: ${available}`
    );
  }

  activeContext = allContexts[contextName];
  console.log(`[Query Loader] Loaded context: ${activeContext.name} (${activeContext.description})`);
  console.log(`[Query Loader] Popular queries: ${activeContext.popular.length}`);
  console.log(`[Query Loader] Long-tail queries: ${activeContext.longTail.length}`);
  console.log(`[Query Loader] Unique words: ${activeContext.uniqueWords.length}`);

  return activeContext;
}

/**
 * Get popular queries from active context
 *
 * @returns {string[]} Array of popular queries
 * @throws {Error} If no context is loaded
 */
export function getPopularQueries() {
  ensureContextLoaded();
  return activeContext.popular;
}

/**
 * Get long-tail queries from active context
 *
 * @returns {string[]} Array of long-tail queries
 * @throws {Error} If no context is loaded
 */
export function getLongTailQueries() {
  ensureContextLoaded();
  return activeContext.longTail;
}

/**
 * Get unique words for query generation from active context
 *
 * @returns {string[]} Array of words for dynamic query generation
 * @throws {Error} If no context is loaded
 */
export function getUniqueWords() {
  ensureContextLoaded();
  return activeContext.uniqueWords;
}

/**
 * Get the name of the active context
 *
 * @returns {string} Context name
 * @throws {Error} If no context is loaded
 */
export function getContextName() {
  ensureContextLoaded();
  return activeContext.name;
}

/**
 * Get the description of the active context
 *
 * @returns {string} Context description
 * @throws {Error} If no context is loaded
 */
export function getContextDescription() {
  ensureContextLoaded();
  return activeContext.description;
}

/**
 * Generate a random query from unique words
 * Combines 1-3 words randomly
 *
 * @returns {string} Generated query
 * @throws {Error} If no context is loaded
 */
export function generateRandomQuery() {
  ensureContextLoaded();
  const words = activeContext.uniqueWords;
  const count = Math.floor(Math.random() * 3) + 1; // 1-3 words

  const selectedWords = [];
  for (let i = 0; i < count; i++) {
    const word = words[Math.floor(Math.random() * words.length)];
    selectedWords.push(word);
  }

  return selectedWords.join(' ');
}

/**
 * Get a random element from an array
 * Helper function for query selection
 *
 * @param {any[]} array - Array to select from
 * @returns {any} Random element
 */
export function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get all available context names
 * Useful for validation and error messages
 *
 * @returns {string[]} Array of context names
 */
export function getAvailableContexts() {
  return Object.keys(allContexts);
}

/**
 * Check if a context exists
 *
 * @param {string} contextName - Name of the context to check
 * @returns {boolean} True if context exists
 */
export function contextExists(contextName) {
  return contextName in allContexts;
}

/**
 * Ensure a context is loaded before accessing data
 * @private
 * @throws {Error} If no context is loaded
 */
function ensureContextLoaded() {
  if (!activeContext) {
    throw new Error(
      'No query context loaded. Call loadQueryContext() first. ' +
      'Available contexts: ' + getAvailableContexts().join(', ')
    );
  }
}

/**
 * Get statistics about the active context
 *
 * @returns {object} Statistics object
 */
export function getContextStats() {
  ensureContextLoaded();
  return {
    name: activeContext.name,
    description: activeContext.description,
    popularCount: activeContext.popular.length,
    longTailCount: activeContext.longTail.length,
    uniqueWordsCount: activeContext.uniqueWords.length,
    totalQueries: activeContext.popular.length + activeContext.longTail.length,
  };
}
