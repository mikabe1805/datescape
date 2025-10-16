import { 
  collection, 
  doc, 
  addDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db, ensureAuth } from './firebaseClient.mjs';
import { calculatePercentiles, formatNumber } from './percentiles.mjs';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const MESSAGE_COUNT = parseInt(process.env.BATCH_MESSAGE_COUNT) || 1000;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 500; // Firestore max is 500
const MATCH_ID = 'bench-batch-test';

console.log('🔬 Batch Write Performance Comparison\n');
console.log(`Testing ${MESSAGE_COUNT} messages with batch size ${BATCH_SIZE}\n`);

/**
 * Test individual writes
 */
async function testIndividualWrites() {
  console.log('📝 Testing individual writes...');
  const messagesRef = collection(db, `matches/${MATCH_ID}/messages`);
  const latencies = [];
  const startTime = Date.now();
  
  for (let i = 0; i < MESSAGE_COUNT; i++) {
    const writeStart = Date.now();
    await addDoc(messagesRef, {
      text: `Individual write message ${i}`,
      senderId: 'batch-test',
      clientSentAt: Date.now(),
      serverSentAt: serverTimestamp(),
      testType: 'individual',
    });
    const writeLatency = Date.now() - writeStart;
    latencies.push(writeLatency);
    
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r   Progress: ${i + 1}/${MESSAGE_COUNT}`);
    }
  }
  
  const totalTime = Date.now() - startTime;
  process.stdout.write(`\r   Progress: ${MESSAGE_COUNT}/${MESSAGE_COUNT} ✓\n`);
  
  return {
    method: 'Individual Writes',
    totalMessages: MESSAGE_COUNT,
    totalTimeMs: totalTime,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    percentiles: calculatePercentiles(latencies, [50, 95, 99]),
    throughput: MESSAGE_COUNT / (totalTime / 1000),
    totalWrites: MESSAGE_COUNT, // Each message is 1 write
  };
}

/**
 * Test batch writes
 */
async function testBatchWrites() {
  console.log('\n📦 Testing batch writes...');
  const messagesRef = collection(db, `matches/${MATCH_ID}/messages`);
  const batchLatencies = [];
  const startTime = Date.now();
  let messagesSent = 0;
  let batchCount = 0;
  
  while (messagesSent < MESSAGE_COUNT) {
    const batchStart = Date.now();
    const batch = writeBatch(db);
    const messagesInBatch = Math.min(BATCH_SIZE, MESSAGE_COUNT - messagesSent);
    
    for (let i = 0; i < messagesInBatch; i++) {
      const docRef = doc(messagesRef);
      batch.set(docRef, {
        text: `Batch write message ${messagesSent + i}`,
        senderId: 'batch-test',
        clientSentAt: Date.now(),
        serverSentAt: serverTimestamp(),
        testType: 'batch',
      });
    }
    
    await batch.commit();
    const batchLatency = Date.now() - batchStart;
    batchLatencies.push(batchLatency);
    
    messagesSent += messagesInBatch;
    batchCount++;
    
    if (messagesSent % 100 === 0) {
      process.stdout.write(`\r   Progress: ${messagesSent}/${MESSAGE_COUNT}`);
    }
  }
  
  const totalTime = Date.now() - startTime;
  process.stdout.write(`\r   Progress: ${MESSAGE_COUNT}/${MESSAGE_COUNT} ✓\n`);
  
  return {
    method: 'Batch Writes',
    totalMessages: MESSAGE_COUNT,
    totalTimeMs: totalTime,
    avgLatencyMs: batchLatencies.reduce((a, b) => a + b, 0) / batchLatencies.length,
    percentiles: calculatePercentiles(batchLatencies, [50, 95, 99]),
    throughput: MESSAGE_COUNT / (totalTime / 1000),
    totalWrites: batchCount, // Each batch commit is counted as multiple writes (messagesInBatch)
    batchCount,
    avgMessagesPerBatch: MESSAGE_COUNT / batchCount,
  };
}

/**
 * Calculate cost comparison
 */
function calculateCostComparison(individualStats, batchStats) {
  // Firestore pricing: $0.18 per 100k writes
  const individualCost = (individualStats.totalWrites / 100000) * 0.18;
  const batchCost = (batchStats.totalMessages / 100000) * 0.18; // Batch writes count per document
  
  return {
    individualCost,
    batchCost,
    savings: individualCost - batchCost,
    savingsPercent: ((individualCost - batchCost) / individualCost) * 100,
  };
}

/**
 * Generate comparison report
 */
function generateReport(individualStats, batchStats, costComparison) {
  const speedup = individualStats.totalTimeMs / batchStats.totalTimeMs;
  const throughputImprovement = ((batchStats.throughput / individualStats.throughput) - 1) * 100;
  
  const report = `# Batch Write Performance Comparison

**Generated:** ${new Date().toISOString()}  
**Test Configuration:** ${MESSAGE_COUNT} messages

## Summary

**Batch writes are ${speedup.toFixed(2)}x faster** than individual writes for this workload.

## Performance Comparison

| Metric | Individual Writes | Batch Writes | Improvement |
|--------|------------------|--------------|-------------|
| **Total Time** | ${individualStats.totalTimeMs.toFixed(0)} ms | ${batchStats.totalTimeMs.toFixed(0)} ms | **${speedup.toFixed(2)}x faster** |
| **Throughput** | ${individualStats.throughput.toFixed(2)} msg/s | ${batchStats.throughput.toFixed(2)} msg/s | **+${throughputImprovement.toFixed(1)}%** |
| Avg Write Latency | ${individualStats.avgLatencyMs.toFixed(2)} ms | ${batchStats.avgLatencyMs.toFixed(2)} ms | ${(((individualStats.avgLatencyMs - batchStats.avgLatencyMs) / individualStats.avgLatencyMs) * 100).toFixed(1)}% faster |
| p50 | ${individualStats.percentiles.p50.toFixed(2)} ms | ${batchStats.percentiles.p50.toFixed(2)} ms | - |
| p95 | ${individualStats.percentiles.p95.toFixed(2)} ms | ${batchStats.percentiles.p95.toFixed(2)} ms | - |
| p99 | ${individualStats.percentiles.p99.toFixed(2)} ms | ${batchStats.percentiles.p99.toFixed(2)} ms | - |

## Cost Analysis

| Metric | Individual Writes | Batch Writes | Savings |
|--------|------------------|--------------|---------|
| Firestore Writes | ${formatNumber(individualStats.totalWrites)} | ${formatNumber(batchStats.totalMessages)} | - |
| Write Cost | $${individualCost.toFixed(6)} | $${batchCost.toFixed(6)} | $${costComparison.savings.toFixed(6)} |
| Cost per 1k msgs | $${(individualCost / (MESSAGE_COUNT / 1000)).toFixed(6)} | $${(batchCost / (MESSAGE_COUNT / 1000)).toFixed(6)} | **${costComparison.savingsPercent.toFixed(1)}% cheaper** |

${batchStats.batchCount ? `
## Batch Details

- **Total Batches:** ${batchStats.batchCount}
- **Avg Messages per Batch:** ${batchStats.avgMessagesPerBatch.toFixed(1)}
- **Batch Size Limit:** ${BATCH_SIZE}
` : ''}

## Recommendations

Based on these results:

1. **Use batch writes** when possible for ${speedup.toFixed(1)}x performance improvement
2. Batch writes reduce total time by ${((1 - 1/speedup) * 100).toFixed(1)}%
3. ${costComparison.savingsPercent > 0 ? `No cost difference (Firestore charges per document write regardless of batching)` : 'Same cost per write'}
4. Optimal for: Bulk message sends, message history imports, batch notifications

## When to Use Batch Writes

✅ **Use Batch Writes:**
- Sending multiple messages at once
- Importing message history
- Bulk operations
- Offline message sync

❌ **Use Individual Writes:**
- Real-time user messages (immediate feedback)
- When you need individual write confirmations
- Operations requiring immediate error handling per message

---

*Note: While batch writes don't reduce Firestore costs (charged per document), they significantly improve performance and reduce network overhead.*
`;

  return report;
}

/**
 * Run the comparison benchmark
 */
async function runComparison() {
  try {
    console.log('🔥 Initializing Firebase...\n');
    await ensureAuth();
    
    // Test individual writes
    const individualStats = await testIndividualWrites();
    
    // Small delay between tests
    console.log('\n⏳ Waiting 5 seconds before batch test...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test batch writes
    const batchStats = await testBatchWrites();
    
    // Calculate cost comparison
    const costComparison = calculateCostComparison(individualStats, batchStats);
    
    // Generate report
    console.log('\n📊 Generating report...\n');
    const report = generateReport(individualStats, batchStats, costComparison);
    fs.writeFileSync('batch-write-comparison.md', report);
    
    // Print summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🎉 BATCH WRITE COMPARISON COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`📊 Results for ${MESSAGE_COUNT} messages:\n`);
    console.log(`   Individual Writes: ${individualStats.totalTimeMs.toFixed(0)}ms (${individualStats.throughput.toFixed(2)} msg/s)`);
    console.log(`   Batch Writes:      ${batchStats.totalTimeMs.toFixed(0)}ms (${batchStats.throughput.toFixed(2)} msg/s)`);
    console.log(`   Speedup:           ${(individualStats.totalTimeMs / batchStats.totalTimeMs).toFixed(2)}x faster\n`);
    console.log('📁 Report written to: batch-write-comparison.md\n');
    
    // Force exit to avoid hanging
    console.log('🏁 Comparison complete! Exiting...\n');
    setTimeout(() => {
      process.exit(0);
    }, 500);
    
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run the comparison
runComparison();

