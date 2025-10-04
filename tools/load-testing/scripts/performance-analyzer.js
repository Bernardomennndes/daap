#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class PerformanceAnalyzer {
  constructor() {
    this.resultsDir = path.join(__dirname, '../results');
  }

  // Analyze load test results
  analyzeResults(resultsFile) {
    console.log('📊 Analyzing load test results...');
    
    if (!fs.existsSync(resultsFile)) {
      console.error(`❌ Results file not found: ${resultsFile}`);
      return;
    }

    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 PERFORMANCE ANALYSIS REPORT');
    console.log('='.repeat(60));
    
    this.printOverview(results);
    this.printCacheComparison(results);
    this.printToolComparison(results);
    this.printRecommendations(results);
    
    // Generate detailed analysis
    this.generateDetailedReport(results, resultsFile);
  }

  // Print overview statistics
  printOverview(results) {
    console.log('\n📋 Test Overview:');
    console.log(`   - Timestamp: ${results.timestamp}`);
    console.log(`   - Total Queries: ${results.totalQueries}`);
    console.log(`   - Concurrency: ${results.concurrency}`);
    console.log(`   - Cache Systems Tested: ${Object.keys(results.tests || {}).join(', ')}`);
  }

  // Print cache system comparison
  printCacheComparison(results) {
    console.log('\n🔄 Cache System Comparison:');
    
    if (!results.comparison) {
      console.log('   - No comparison data available');
      return;
    }
    
    const comp = results.comparison;
    
    if (comp.requestsPerSecond) {
      console.log('\n   📊 Requests per Second:');
      console.log(`      Redis:     ${comp.requestsPerSecond.redis}`);
      console.log(`      Dragonfly: ${comp.requestsPerSecond.dragonfly}`);
      console.log(`      Improvement: ${comp.requestsPerSecond.improvement}`);
    }
    
    if (comp.averageResponseTime) {
      console.log('\n   ⏱️  Average Response Time:');
      console.log(`      Redis:     ${comp.averageResponseTime.redis}ms`);
      console.log(`      Dragonfly: ${comp.averageResponseTime.dragonfly}ms`);
      console.log(`      Improvement: ${comp.averageResponseTime.improvement}`);
    }
    
    if (comp.percentile95) {
      console.log('\n   📈 95th Percentile:');
      console.log(`      Redis:     ${comp.percentile95.redis}ms`);
      console.log(`      Dragonfly: ${comp.percentile95.dragonfly}ms`);
      console.log(`      Improvement: ${comp.percentile95.improvement}`);
    }
  }

  // Print tool comparison
  printToolComparison(results) {
    console.log('\n🔧 Tool Comparison:');
    
    const tools = ['custom', 'ab', 'wrk', 'artillery'];
    
    for (const cacheType of Object.keys(results.tests || {})) {
      console.log(`\n   ${cacheType.toUpperCase()} Cache Results:`);
      
      const cacheResults = results.tests[cacheType];
      
      for (const tool of tools) {
        if (cacheResults[tool] && cacheResults[tool].summary) {
          const summary = cacheResults[tool].summary;
          console.log(`      ${tool.toUpperCase()}:`);
          
          if (summary.requestsPerSecond) {
            console.log(`         - RPS: ${summary.requestsPerSecond}`);
          }
          if (summary.averageResponseTime) {
            console.log(`         - Avg Response: ${summary.averageResponseTime}ms`);
          }
          if (summary.successfulRequests && summary.totalRequests) {
            const successRate = (summary.successfulRequests / summary.totalRequests * 100).toFixed(1);
            console.log(`         - Success Rate: ${successRate}%`);
          }
        }
      }
    }
  }

  // Print recommendations
  printRecommendations(results) {
    console.log('\n💡 Recommendations:');
    
    if (!results.comparison || !results.comparison.requestsPerSecond) {
      console.log('   - Unable to generate recommendations without comparison data');
      return;
    }
    
    const rpsImprovement = parseFloat(results.comparison.requestsPerSecond.improvement);
    const responseImprovement = parseFloat(results.comparison.averageResponseTime.improvement);
    
    if (rpsImprovement > 0) {
      console.log(`   ✅ Dragonfly shows ${rpsImprovement}% better throughput than Redis`);
      console.log('      → Consider using Dragonfly for high-throughput scenarios');
    } else if (rpsImprovement < 0) {
      console.log(`   ✅ Redis shows ${Math.abs(rpsImprovement)}% better throughput than Dragonfly`);
      console.log('      → Redis may be more suitable for your current workload');
    }
    
    if (responseImprovement > 0) {
      console.log(`   ✅ Dragonfly shows ${responseImprovement}% better response times`);
      console.log('      → Better user experience with Dragonfly');
    } else if (responseImprovement < 0) {
      console.log(`   ✅ Redis shows ${Math.abs(responseImprovement)}% better response times`);
      console.log('      → Redis provides faster responses for your queries');
    }
    
    // Additional recommendations
    console.log('\n   🎯 Additional Recommendations:');
    console.log('      → Test with your actual production query patterns');
    console.log('      → Monitor cache hit ratios in production');
    console.log('      → Consider implementing cache warming strategies');
    console.log('      → Set up monitoring and alerting for cache performance');
  }

  // Generate detailed report
  generateDetailedReport(results, originalFile) {
    const reportDir = path.dirname(originalFile);
    const reportFile = path.join(reportDir, 'detailed-analysis.md');
    
    let report = `# DAAP Cache Performance Analysis Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Source:** ${path.basename(originalFile)}\n\n`;
    
    report += `## Executive Summary\n\n`;
    report += this.generateExecutiveSummary(results);
    
    report += `\n## Detailed Results\n\n`;
    report += this.generateDetailedResults(results);
    
    report += `\n## Performance Metrics\n\n`;
    report += this.generatePerformanceMetrics(results);
    
    report += `\n## Recommendations\n\n`;
    report += this.generateRecommendationsMarkdown(results);
    
    report += `\n## Raw Data\n\n`;
    report += '```json\n';
    report += JSON.stringify(results, null, 2);
    report += '\n```\n';
    
    fs.writeFileSync(reportFile, report);
    console.log(`\n📄 Detailed report saved: ${reportFile}`);
  }

  // Generate executive summary
  generateExecutiveSummary(results) {
    if (!results.comparison) {
      return 'No comparison data available for executive summary.';
    }
    
    const comp = results.comparison;
    let summary = '';
    
    if (comp.requestsPerSecond) {
      const improvement = parseFloat(comp.requestsPerSecond.improvement);
      const winner = improvement > 0 ? 'Dragonfly' : 'Redis';
      const loser = improvement > 0 ? 'Redis' : 'Dragonfly';
      
      summary += `**Throughput Winner:** ${winner} outperformed ${loser} by ${Math.abs(improvement)}% in requests per second.\n\n`;
    }
    
    if (comp.averageResponseTime) {
      const improvement = parseFloat(comp.averageResponseTime.improvement);
      const winner = improvement > 0 ? 'Dragonfly' : 'Redis';
      const loser = improvement > 0 ? 'Redis' : 'Dragonfly';
      
      summary += `**Response Time Winner:** ${winner} provided ${Math.abs(improvement)}% faster average response times than ${loser}.\n\n`;
    }
    
    summary += `**Test Scale:** ${results.totalQueries} queries with ${results.concurrency} concurrent connections.\n\n`;
    
    return summary;
  }

  // Generate detailed results section
  generateDetailedResults(results) {
    let details = '';
    
    for (const [cacheType, cacheResults] of Object.entries(results.tests || {})) {
      details += `### ${cacheType.toUpperCase()} Cache Results\n\n`;
      
      for (const [tool, toolResults] of Object.entries(cacheResults)) {
        if (toolResults.summary) {
          details += `#### ${tool.toUpperCase()} Tool\n\n`;
          details += '| Metric | Value |\n';
          details += '|--------|-------|\n';
          
          const summary = toolResults.summary;
          if (summary.requestsPerSecond) {
            details += `| Requests per Second | ${summary.requestsPerSecond} |\n`;
          }
          if (summary.averageResponseTime) {
            details += `| Average Response Time | ${summary.averageResponseTime}ms |\n`;
          }
          if (summary.percentile95) {
            details += `| 95th Percentile | ${summary.percentile95}ms |\n`;
          }
          if (summary.successfulRequests && summary.totalRequests) {
            const successRate = (summary.successfulRequests / summary.totalRequests * 100).toFixed(1);
            details += `| Success Rate | ${successRate}% |\n`;
          }
          
          details += '\n';
        }
      }
    }
    
    return details;
  }

  // Generate performance metrics section
  generatePerformanceMetrics(results) {
    if (!results.comparison) {
      return 'No performance metrics available.';
    }
    
    let metrics = '| Metric | Redis | Dragonfly | Improvement |\n';
    metrics += '|--------|-------|-----------|-------------|\n';
    
    const comp = results.comparison;
    
    if (comp.requestsPerSecond) {
      metrics += `| Requests per Second | ${comp.requestsPerSecond.redis} | ${comp.requestsPerSecond.dragonfly} | ${comp.requestsPerSecond.improvement} |\n`;
    }
    
    if (comp.averageResponseTime) {
      metrics += `| Average Response Time (ms) | ${comp.averageResponseTime.redis} | ${comp.averageResponseTime.dragonfly} | ${comp.averageResponseTime.improvement} |\n`;
    }
    
    if (comp.percentile95) {
      metrics += `| 95th Percentile (ms) | ${comp.percentile95.redis} | ${comp.percentile95.dragonfly} | ${comp.percentile95.improvement} |\n`;
    }
    
    return metrics;
  }

  // Generate recommendations in markdown
  generateRecommendationsMarkdown(results) {
    if (!results.comparison) {
      return 'Unable to generate recommendations without comparison data.';
    }
    
    let recommendations = '';
    const comp = results.comparison;
    
    if (comp.requestsPerSecond) {
      const improvement = parseFloat(comp.requestsPerSecond.improvement);
      if (improvement > 5) {
        recommendations += `- **Use Dragonfly**: Shows significant throughput improvement (${improvement}%)\n`;
      } else if (improvement < -5) {
        recommendations += `- **Use Redis**: Shows better throughput performance (${Math.abs(improvement)}%)\n`;
      } else {
        recommendations += `- **Similar Performance**: Both systems show comparable throughput\n`;
      }
    }
    
    recommendations += `- **Monitor Cache Hit Ratios**: Implement monitoring to track cache effectiveness\n`;
    recommendations += `- **Test Production Patterns**: Run tests with actual production query patterns\n`;
    recommendations += `- **Consider Hybrid Approach**: Use different cache systems for different use cases\n`;
    recommendations += `- **Implement Circuit Breakers**: Add fallback mechanisms for cache failures\n`;
    
    return recommendations;
  }

  // Find and analyze latest results
  analyzeLatest() {
    if (!fs.existsSync(this.resultsDir)) {
      console.error(`❌ Results directory not found: ${this.resultsDir}`);
      return;
    }
    
    const files = fs.readdirSync(this.resultsDir)
      .filter(file => file.startsWith('load-test-results-') && file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(this.resultsDir, file),
        time: fs.statSync(path.join(this.resultsDir, file)).mtime
      }))
      .sort((a, b) => b.time - a.time);
    
    if (files.length === 0) {
      console.error('❌ No load test results found');
      return;
    }
    
    console.log(`📁 Found ${files.length} result files, analyzing latest: ${files[0].name}`);
    this.analyzeResults(files[0].path);
  }

  // Compare multiple test results
  compareResults(resultFiles) {
    console.log('🔄 Comparing multiple test results...');
    
    const comparisons = resultFiles.map(file => {
      if (!fs.existsSync(file)) {
        console.error(`❌ File not found: ${file}`);
        return null;
      }
      
      const results = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        file: path.basename(file),
        timestamp: results.timestamp,
        results
      };
    }).filter(Boolean);
    
    if (comparisons.length < 2) {
      console.error('❌ Need at least 2 result files for comparison');
      return;
    }
    
    // TODO: Implement multi-file comparison logic
    console.log('📊 Multi-file comparison not yet implemented');
  }
}

// CLI Usage
if (require.main === module) {
  const analyzer = new PerformanceAnalyzer();
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node performance-analyzer.js <results-file>     # Analyze specific file');
    console.log('  node performance-analyzer.js --latest           # Analyze latest results');
    console.log('  node performance-analyzer.js --compare <file1> <file2> ...  # Compare multiple results');
    process.exit(1);
  }
  
  if (args[0] === '--latest') {
    analyzer.analyzeLatest();
  } else if (args[0] === '--compare') {
    analyzer.compareResults(args.slice(1));
  } else {
    analyzer.analyzeResults(args[0]);
  }
}

module.exports = PerformanceAnalyzer;
