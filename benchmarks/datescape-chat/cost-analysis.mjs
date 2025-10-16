import fs from 'fs';
import { formatNumber } from './percentiles.mjs';

/**
 * Cost Optimization Analysis Tool
 * 
 * This tool generates a comprehensive cost analysis report comparing
 * different optimization strategies for Firebase Firestore operations.
 */

// Firestore pricing (standard, multi-region)
const PRICING = {
  reads: 0.06 / 100000,      // $0.06 per 100k reads
  writes: 0.18 / 100000,     // $0.18 per 100k writes
  deletes: 0.02 / 100000,    // $0.02 per 100k deletes
  storage: 0.18 / 1024,      // $0.18 per GB/month
};

/**
 * Scenario: Baseline (no optimization)
 */
const BASELINE_SCENARIO = {
  name: 'Baseline (No Optimization)',
  description: 'Direct writes and reads with no caching or batching',
  assumptions: [
    '1000 daily active users (DAU)',
    '50 messages sent per user per day',
    'Each message triggers: 1 write + 10 reads (avg 10 recipients)',
    'No caching, no batching',
    'Full message history loaded on chat open (100 messages)',
  ],
  calculate: () => {
    const dau = 1000;
    const messagesPerUser = 50;
    const totalMessages = dau * messagesPerUser;
    const readsPerMessage = 10; // Recipients
    const historyReads = dau * 100; // Loading history
    
    const writes = totalMessages;
    const reads = (totalMessages * readsPerMessage) + historyReads;
    
    return {
      writes,
      reads,
      deletes: 0,
      writeCost: writes * PRICING.writes,
      readCost: reads * PRICING.reads,
      deleteCost: 0,
      totalCost: (writes * PRICING.writes) + (reads * PRICING.reads),
    };
  },
};

/**
 * Scenario: With Client-Side Caching
 */
const CACHING_SCENARIO = {
  name: 'Client-Side Caching',
  description: 'Implement aggressive client-side caching',
  assumptions: [
    '1000 DAU',
    '50 messages sent per user per day',
    'Cache hits: 70% of reads (repeated message views)',
    'History loaded once per session, cached',
    'Writes unchanged',
  ],
  calculate: () => {
    const baseline = BASELINE_SCENARIO.calculate();
    const cacheHitRate = 0.70;
    
    const reads = Math.floor(baseline.reads * (1 - cacheHitRate));
    const writes = baseline.writes;
    
    return {
      writes,
      reads,
      deletes: 0,
      writeCost: writes * PRICING.writes,
      readCost: reads * PRICING.reads,
      deleteCost: 0,
      totalCost: (writes * PRICING.writes) + (reads * PRICING.reads),
      vsBaseline: {
        readsSaved: baseline.reads - reads,
        costSaved: baseline.totalCost - ((writes * PRICING.writes) + (reads * PRICING.reads)),
      },
    };
  },
};

/**
 * Scenario: Batch Writes + Caching
 */
const BATCH_CACHING_SCENARIO = {
  name: 'Batch Writes + Caching',
  description: 'Use batch writes for notifications and implement caching',
  assumptions: [
    '1000 DAU',
    '50 messages sent per user per day',
    'Batch notification writes (groups of 10)',
    'Cache hits: 70% of reads',
    'Pagination: Load 20 messages at a time (not 100)',
  ],
  calculate: () => {
    const dau = 1000;
    const messagesPerUser = 50;
    const totalMessages = dau * messagesPerUser;
    
    // Writes: Same cost (batching doesn't reduce Firestore write charges)
    const writes = totalMessages;
    
    // Reads: Reduced by caching (70%) + pagination
    const baselineReads = (totalMessages * 10) + (dau * 100);
    const paginatedHistoryReads = dau * 20; // Only 20 messages initially
    const messageReads = totalMessages * 10;
    const totalBaseReads = messageReads + paginatedHistoryReads;
    const reads = Math.floor(totalBaseReads * 0.30); // 70% cache hit
    
    return {
      writes,
      reads,
      deletes: 0,
      writeCost: writes * PRICING.writes,
      readCost: reads * PRICING.reads,
      deleteCost: 0,
      totalCost: (writes * PRICING.writes) + (reads * PRICING.reads),
      vsBaseline: {
        readsSaved: (totalMessages * 10 + dau * 100) - reads,
        costSaved: BASELINE_SCENARIO.calculate().totalCost - ((writes * PRICING.writes) + (reads * PRICING.reads)),
      },
    };
  },
};

/**
 * Scenario: Full Optimization
 */
const FULL_OPTIMIZATION_SCENARIO = {
  name: 'Full Optimization',
  description: 'All optimizations: Caching, pagination, lazy loading, TTL cleanup',
  assumptions: [
    '1000 DAU',
    '50 messages sent per user per day',
    'Cache hits: 80% (improved caching strategy)',
    'Pagination: 20 messages at a time',
    'Lazy load images/media (reduces initial read size)',
    'Auto-delete messages > 90 days (reduce storage)',
    'Message deduplication (prevents duplicate writes)',
  ],
  calculate: () => {
    const dau = 1000;
    const messagesPerUser = 50;
    const totalMessages = dau * messagesPerUser;
    
    // Writes: Reduced by 5% due to deduplication
    const writes = Math.floor(totalMessages * 0.95);
    
    // Reads: 80% cache hit, pagination, lazy loading
    const baselineReads = (totalMessages * 10) + (dau * 100);
    const paginatedHistoryReads = dau * 20;
    const messageReads = Math.floor(totalMessages * 10 * 0.90); // Lazy loading saves 10%
    const reads = Math.floor((messageReads + paginatedHistoryReads) * 0.20); // 80% cache
    
    // Deletes: Auto-cleanup of old messages
    const deletes = Math.floor(totalMessages * 0.10); // 10% of messages auto-deleted
    
    return {
      writes,
      reads,
      deletes,
      writeCost: writes * PRICING.writes,
      readCost: reads * PRICING.reads,
      deleteCost: deletes * PRICING.deletes,
      totalCost: (writes * PRICING.writes) + (reads * PRICING.reads) + (deletes * PRICING.deletes),
      vsBaseline: {
        writesSaved: BASELINE_SCENARIO.calculate().writes - writes,
        readsSaved: BASELINE_SCENARIO.calculate().reads - reads,
        costSaved: BASELINE_SCENARIO.calculate().totalCost - ((writes * PRICING.writes) + (reads * PRICING.reads) + (deletes * PRICING.deletes)),
      },
    };
  },
};

/**
 * Generate cost optimization report
 */
function generateCostOptimizationReport() {
  const scenarios = [
    BASELINE_SCENARIO,
    CACHING_SCENARIO,
    BATCH_CACHING_SCENARIO,
    FULL_OPTIMIZATION_SCENARIO,
  ];
  
  const results = scenarios.map(scenario => ({
    ...scenario,
    results: scenario.calculate(),
  }));
  
  const baseline = results[0].results;
  
  const report = `# Firebase Firestore Cost Optimization Analysis

**Generated:** ${new Date().toISOString()}  
**Analysis Period:** 30 days  
**Daily Active Users:** 1,000

## Executive Summary

Through progressive optimization strategies, Firebase Firestore operational costs can be reduced by **${((1 - results[3].results.totalCost / baseline.totalCost) * 100).toFixed(1)}%** compared to baseline implementation.

### Monthly Cost Comparison

| Scenario | Monthly Cost | vs Baseline | Savings |
|----------|-------------|-------------|---------|
| Baseline | **$${(baseline.totalCost * 30).toFixed(2)}** | - | - |
| Client Caching | $${(results[1].results.totalCost * 30).toFixed(2)} | ${((1 - results[1].results.totalCost / baseline.totalCost) * 100).toFixed(1)}% | $${((baseline.totalCost - results[1].results.totalCost) * 30).toFixed(2)} |
| Batch + Caching | $${(results[2].results.totalCost * 30).toFixed(2)} | ${((1 - results[2].results.totalCost / baseline.totalCost) * 100).toFixed(1)}% | $${((baseline.totalCost - results[2].results.totalCost) * 30).toFixed(2)} |
| **Full Optimization** | **$${(results[3].results.totalCost * 30).toFixed(2)}** | **${((1 - results[3].results.totalCost / baseline.totalCost) * 100).toFixed(1)}%** | **$${((baseline.totalCost - results[3].results.totalCost) * 30).toFixed(2)}** |

---

${results.map((scenario, idx) => {
  const r = scenario.results;
  const isBaseline = idx === 0;
  
  return `## Scenario ${idx + 1}: ${scenario.name}

${scenario.description}

### Assumptions
${scenario.assumptions.map(a => `- ${a}`).join('\n')}

### Daily Operations

| Operation | Count | Daily Cost | % of Total |
|-----------|-------|------------|------------|
| Reads | ${formatNumber(r.reads)} | $${r.readCost.toFixed(4)} | ${((r.readCost / r.totalCost) * 100).toFixed(1)}% |
| Writes | ${formatNumber(r.writes)} | $${r.writeCost.toFixed(4)} | ${((r.writeCost / r.totalCost) * 100).toFixed(1)}% |
${r.deletes > 0 ? `| Deletes | ${formatNumber(r.deletes)} | $${r.deleteCost.toFixed(4)} | ${((r.deleteCost / r.totalCost) * 100).toFixed(1)}% |` : ''}
| **Total** | - | **$${r.totalCost.toFixed(4)}** | **100%** |

${!isBaseline ? `
### Optimization Impact

- **Reads Saved:** ${formatNumber(r.vsBaseline.readsSaved)} (${((r.vsBaseline.readsSaved / baseline.reads) * 100).toFixed(1)}%)
${r.vsBaseline.writesSaved ? `- **Writes Saved:** ${formatNumber(r.vsBaseline.writesSaved)} (${((r.vsBaseline.writesSaved / baseline.writes) * 100).toFixed(1)}%)` : ''}
- **Daily Cost Savings:** $${r.vsBaseline.costSaved.toFixed(4)} (${((r.vsBaseline.costSaved / baseline.totalCost) * 100).toFixed(1)}%)
- **Monthly Cost Savings:** $${(r.vsBaseline.costSaved * 30).toFixed(2)}
- **Annual Cost Savings:** $${(r.vsBaseline.costSaved * 365).toFixed(2)}
` : ''}

---
`;
}).join('\n')}

## Optimization Strategies Explained

### 1. Client-Side Caching
- **Implementation:** Use local storage/IndexedDB to cache messages
- **Impact:** Reduces read operations by 70%
- **Complexity:** Low - Medium
- **Best for:** Frequently viewed messages, chat history

### 2. Pagination
- **Implementation:** Load messages in chunks (20-50 at a time)
- **Impact:** Reduces initial load reads by 80%
- **Complexity:** Low
- **Best for:** Long conversation histories

### 3. Batch Writes
- **Implementation:** Use Firestore \`writeBatch()\` API
- **Impact:** No cost savings, but 3-5x performance improvement
- **Complexity:** Low
- **Best for:** Bulk operations, notifications

### 4. Lazy Loading
- **Implementation:** Load images/media only when visible
- **Impact:** Reduces read payload size by 10-20%
- **Complexity:** Medium
- **Best for:** Media-heavy conversations

### 5. Message Deduplication
- **Implementation:** Check for existing messages before writing
- **Impact:** Prevents 3-7% duplicate writes
- **Complexity:** Low
- **Best for:** Retry logic, offline sync

### 6. Auto-Cleanup / TTL
- **Implementation:** Delete messages older than X days
- **Impact:** Reduces storage costs, minimal operation cost
- **Complexity:** Medium (requires Cloud Functions)
- **Best for:** Temporary conversations, compliance

## Scaling Projections

### Cost at Different User Scales (Monthly, Full Optimization)

| DAU | Baseline Cost | Optimized Cost | Monthly Savings |
|-----|---------------|----------------|-----------------|
| 100 | $${((baseline.totalCost * 30) / 10).toFixed(2)} | $${((results[3].results.totalCost * 30) / 10).toFixed(2)} | $${(((baseline.totalCost - results[3].results.totalCost) * 30) / 10).toFixed(2)} |
| 1,000 | $${(baseline.totalCost * 30).toFixed(2)} | $${(results[3].results.totalCost * 30).toFixed(2)} | $${((baseline.totalCost - results[3].results.totalCost) * 30).toFixed(2)} |
| 10,000 | $${(baseline.totalCost * 300).toFixed(2)} | $${(results[3].results.totalCost * 300).toFixed(2)} | $${((baseline.totalCost - results[3].results.totalCost) * 300).toFixed(2)} |
| 100,000 | $${(baseline.totalCost * 3000).toFixed(2)} | $${(results[3].results.totalCost * 3000).toFixed(2)} | $${((baseline.totalCost - results[3].results.totalCost) * 3000).toFixed(2)} |

### Annual Savings (1000 DAU)

- **Baseline Annual Cost:** $${(baseline.totalCost * 365).toFixed(2)}
- **Optimized Annual Cost:** $${(results[3].results.totalCost * 365).toFixed(2)}
- **Annual Savings:** $${((baseline.totalCost - results[3].results.totalCost) * 365).toFixed(2)} (**${((1 - results[3].results.totalCost / baseline.totalCost) * 100).toFixed(1)}%** reduction)

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)
1. Implement client-side caching (70% read reduction)
2. Add pagination to message lists
3. **Impact:** ~60% cost reduction
4. **Effort:** Low

### Phase 2: Performance Optimization (2-3 weeks)
1. Implement batch writes for notifications
2. Add lazy loading for media
3. Optimize queries with composite indexes
4. **Impact:** Performance improvement, minor cost benefit
5. **Effort:** Medium

### Phase 3: Advanced Optimization (3-4 weeks)
1. Message deduplication logic
2. Implement auto-cleanup Cloud Function
3. Add offline support with sync optimization
4. **Impact:** Additional 10-15% cost reduction
5. **Effort:** Medium-High

## Cost Per User Analysis

| Scenario | Cost per DAU (Daily) | Cost per DAU (Monthly) | Cost per MAU (Monthly) |
|----------|---------------------|----------------------|---------------------|
| Baseline | $${(baseline.totalCost / 1000).toFixed(6)} | $${((baseline.totalCost * 30) / 1000).toFixed(4)} | $${((baseline.totalCost * 30) / 3000).toFixed(5)} |
| Optimized | $${(results[3].results.totalCost / 1000).toFixed(6)} | $${((results[3].results.totalCost * 30) / 1000).toFixed(4)} | $${((results[3].results.totalCost * 30) / 3000).toFixed(5)} |

*Assuming MAU = 3x DAU (industry standard)*

## Recommendations

1. **Immediate:** Implement client-side caching and pagination (Phase 1)
   - Easiest to implement
   - Biggest cost impact
   - Immediate ROI

2. **Short-term:** Add batch operations and lazy loading (Phase 2)
   - Improves performance significantly
   - Better user experience
   - Prepares for scale

3. **Long-term:** Implement cleanup and advanced optimizations (Phase 3)
   - Sustainable at scale
   - Compliance-ready
   - Production-grade architecture

## Monitoring & KPIs

Track these metrics to measure optimization impact:

- Firestore read/write operations (Firebase Console)
- Cache hit rate (custom analytics)
- Average messages loaded per session
- Cost per active user (calculated)
- P95 load time for conversations

---

*Note: Costs calculated using standard Firestore pricing (multi-region). Actual costs may vary based on region, usage patterns, and network egress. This analysis assumes steady-state operations and does not account for Firebase Functions, storage, or hosting costs.*

**Generated by datescape-chat-benchmark cost analysis tool**
`;

  return report;
}

// Generate and write the report
console.log('💰 Generating cost optimization analysis...\n');
const report = generateCostOptimizationReport();
fs.writeFileSync('cost-optimization-analysis.md', report);

console.log('✅ Cost optimization analysis complete!\n');
console.log('📁 Report written to: cost-optimization-analysis.md\n');
console.log('This report includes:');
console.log('   - 4 optimization scenarios with cost breakdowns');
console.log('   - Scaling projections (100 to 100k DAU)');
console.log('   - Implementation roadmap');
console.log('   - Strategy recommendations\n');

// Force exit
process.exit(0);

