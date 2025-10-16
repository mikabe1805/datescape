import { 
  collection, 
  doc, 
  setDoc, 
  addDoc,
  onSnapshot, 
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';
import { db, ensureAuth } from './firebaseClient.mjs';
import { calculatePercentiles, calculateStats, formatMs, formatNumber } from './percentiles.mjs';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Configuration from environment
const CONFIG = {
  clients: parseInt(process.env.CLIENTS) || 200,
  durationSec: parseInt(process.env.DURATION_SEC) || 300,
  sendMinMs: parseInt(process.env.SEND_MIN_MS) || 4000,
  sendMaxMs: parseInt(process.env.SEND_MAX_MS) || 7000,
  matchCount: parseInt(process.env.MATCH_COUNT) || 20,
  collPathTemplate: process.env.COLL_PATH_TEMPLATE || '/matches/{matchId}/messages',
  deliveryTimeoutMs: parseInt(process.env.DELIVERY_TIMEOUT_MS) || 20000,
  enableMessageSizeVariance: process.env.ENABLE_MESSAGE_SIZE_VARIANCE === 'true',
  enableMemoryProfiling: process.env.ENABLE_MEMORY_PROFILING !== 'false', // Default true
  memoryProfileIntervalSec: parseInt(process.env.MEMORY_PROFILE_INTERVAL_SEC) || 30,
};

// Message size configurations (small, medium, large)
const MESSAGE_SIZES = [
  { name: 'small', bytes: 100, weight: 0.6 },   // 60% small messages
  { name: 'medium', bytes: 1024, weight: 0.3 }, // 30% medium messages
  { name: 'large', bytes: 10240, weight: 0.1 }, // 10% large messages
];

console.log('📊 Benchmark Configuration:');
console.log(JSON.stringify(CONFIG, null, 2));

// Global tracking
const allLatencies = [];
const allMessages = []; // For CSV export
let totalSent = 0;
let totalReceived = 0;
let testStartTime = 0;
let testEndTime = 0;

// Advanced metrics tracking
const memorySnapshots = [];
const latenciesBySize = { small: [], medium: [], large: [] };
let totalReconnections = 0;
let totalListenerErrors = 0;
const messageSizeStats = { small: 0, medium: 0, large: 0 };

/**
 * Create or verify test matches exist
 */
async function setupMatches() {
  console.log(`\n🔨 Setting up ${CONFIG.matchCount} test matches...`);
  
  for (let i = 0; i < CONFIG.matchCount; i++) {
    const matchId = `bench-${i}`;
    const matchRef = doc(db, 'matches', matchId);
    
    try {
      await setDoc(matchRef, {
        createdAt: serverTimestamp(),
        benchmarkMatch: true,
        participants: ['bench-client'],
      }, { merge: true });
    } catch (error) {
      console.error(`❌ Failed to create match ${matchId}:`, error.message);
      throw error;
    }
  }
  
  console.log('✅ Test matches ready');
}

/**
 * Get random send interval
 */
function getRandomInterval() {
  return Math.floor(Math.random() * (CONFIG.sendMaxMs - CONFIG.sendMinMs + 1)) + CONFIG.sendMinMs;
}

/**
 * Select message size based on weights
 */
function selectMessageSize() {
  if (!CONFIG.enableMessageSizeVariance) {
    return MESSAGE_SIZES[0]; // Always small if variance disabled
  }
  
  const rand = Math.random();
  let cumulative = 0;
  
  for (const size of MESSAGE_SIZES) {
    cumulative += size.weight;
    if (rand <= cumulative) {
      return size;
    }
  }
  
  return MESSAGE_SIZES[0];
}

/**
 * Generate message payload of specific size
 */
function generateMessagePayload(sizeConfig) {
  const baseText = `Benchmark message - ${sizeConfig.name}`;
  const padding = 'x'.repeat(Math.max(0, sizeConfig.bytes - baseText.length - 50));
  return baseText + ' ' + padding;
}

/**
 * Take memory snapshot
 */
function takeMemorySnapshot(label = '') {
  if (!CONFIG.enableMemoryProfiling) return null;
  
  const usage = process.memoryUsage();
  const snapshot = {
    timestamp: Date.now(),
    label,
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
    externalMB: Math.round(usage.external / 1024 / 1024),
    rssMB: Math.round(usage.rss / 1024 / 1024),
  };
  
  memorySnapshots.push(snapshot);
  return snapshot;
}

/**
 * Simulate a single client
 */
class BenchmarkClient {
  constructor(clientId, matchId) {
    this.clientId = clientId;
    this.matchId = matchId;
    this.sent = 0;
    this.received = 0;
    this.pendingMessages = new Map(); // msgId -> { clientSentAt, sent timestamp, size }
    this.unsubscribe = null;
    this.sendInterval = null;
    this.isRunning = false;
    this.latencies = [];
    this.reconnectionCount = 0;
    this.errorCount = 0;
    this.messagesBySizeCategory = { small: 0, medium: 0, large: 0 };
  }

  /**
   * Start listening to messages
   */
  startListening() {
    const messagesPath = CONFIG.collPathTemplate.replace('{matchId}', this.matchId);
    const messagesRef = collection(db, messagesPath);
    const q = query(messagesRef, orderBy('clientSentAt', 'desc'), limit(1000));
    
    this.unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const msgId = change.doc.id;
          
          // Only process messages with clientSentAt
          if (data.clientSentAt) {
            const now = Date.now();
            const latency = now - data.clientSentAt;
            
            this.received++;
            totalReceived++;
            this.latencies.push(latency);
            allLatencies.push(latency);
            
            // Track delivery and size
            let sizeCategory = 'small';
            if (this.pendingMessages.has(msgId)) {
              const pending = this.pendingMessages.get(msgId);
              sizeCategory = pending.sizeCategory || 'small';
              this.pendingMessages.delete(msgId);
            }
            
            // Track latency by size
            if (latenciesBySize[sizeCategory]) {
              latenciesBySize[sizeCategory].push(latency);
            }
            
            // Store for CSV
            allMessages.push({
              ts_iso: new Date().toISOString(),
              matchId: this.matchId,
              clientId: this.clientId,
              msgId,
              latency_ms: latency,
              delivered: true,
              sizeCategory,
            });
          }
        }
      });
    }, (error) => {
      console.error(`❌ Client ${this.clientId} listener error:`, error.message);
      this.errorCount++;
      totalListenerErrors++;
      
      // Track reconnection attempts
      this.reconnectionCount++;
      totalReconnections++;
    });
  }

  /**
   * Send a message
   */
  async sendMessage() {
    if (!this.isRunning) return;
    
    const messagesPath = CONFIG.collPathTemplate.replace('{matchId}', this.matchId);
    const messagesRef = collection(db, messagesPath);
    
    // Select message size
    const sizeConfig = selectMessageSize();
    const messageText = generateMessagePayload(sizeConfig);
    
    const clientSentAt = Date.now();
    const messageData = {
      text: messageText,
      senderId: `bench-client-${this.clientId}`,
      clientSentAt,
      serverSentAt: serverTimestamp(),
      sizeCategory: sizeConfig.name,
      sizeBytesApprox: sizeConfig.bytes,
    };
    
    try {
      const docRef = await addDoc(messagesRef, messageData);
      this.sent++;
      totalSent++;
      
      // Track message by size
      this.messagesBySizeCategory[sizeConfig.name]++;
      messageSizeStats[sizeConfig.name]++;
      
      // Track as pending
      this.pendingMessages.set(docRef.id, { 
        clientSentAt, 
        sentTimestamp: Date.now(),
        sizeCategory: sizeConfig.name,
      });
      
      // Prune old pending messages to prevent memory issues (keep last 100)
      if (this.pendingMessages.size > 100) {
        const entries = Array.from(this.pendingMessages.entries());
        entries.slice(0, this.pendingMessages.size - 100).forEach(([key]) => {
          this.pendingMessages.delete(key);
        });
      }
    } catch (error) {
      console.error(`❌ Client ${this.clientId} send error:`, error.message);
      this.errorCount++;
    }
  }

  /**
   * Start the client
   */
  start() {
    this.isRunning = true;
    this.startListening();
    
    // Schedule first send
    const scheduleNext = () => {
      if (!this.isRunning) return;
      
      this.sendMessage().then(() => {
        if (this.isRunning) {
          const interval = getRandomInterval();
          this.sendInterval = setTimeout(scheduleNext, interval);
        }
      });
    };
    
    scheduleNext();
  }

  /**
   * Stop the client
   */
  stop() {
    this.isRunning = false;
    if (this.sendInterval) {
      clearTimeout(this.sendInterval);
      this.sendInterval = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Get lost messages (still pending after timeout)
   */
  getLostMessages() {
    const now = Date.now();
    const lost = [];
    
    this.pendingMessages.forEach((data, msgId) => {
      if (now - data.sentTimestamp > CONFIG.deliveryTimeoutMs) {
        lost.push({
          ts_iso: new Date().toISOString(),
          matchId: this.matchId,
          clientId: this.clientId,
          msgId,
          latency_ms: -1,
          delivered: false,
        });
      }
    });
    
    return lost;
  }

  /**
   * Get stats for this client
   */
  getStats() {
    return {
      clientId: this.clientId,
      matchId: this.matchId,
      sent: this.sent,
      received: this.received,
      latencies: this.latencies,
      reconnectionCount: this.reconnectionCount,
      errorCount: this.errorCount,
      messagesBySizeCategory: this.messagesBySizeCategory,
    };
  }
}

/**
 * Run the benchmark
 */
async function runBenchmark() {
  console.log('\n🚀 Starting benchmark...\n');
  
  // Authenticate
  await ensureAuth();
  
  // Setup matches
  await setupMatches();
  
  // Create clients
  console.log(`\n👥 Spawning ${CONFIG.clients} clients across ${CONFIG.matchCount} matches...`);
  const clients = [];
  
  for (let i = 0; i < CONFIG.clients; i++) {
    const matchIndex = i % CONFIG.matchCount;
    const matchId = `bench-${matchIndex}`;
    const client = new BenchmarkClient(i, matchId);
    clients.push(client);
  }
  
  // Start all clients
  testStartTime = Date.now();
  takeMemorySnapshot('test_start');
  clients.forEach(client => client.start());
  console.log('✅ All clients started\n');
  
  // Progress reporting with memory profiling
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - testStartTime) / 1000);
    const remaining = CONFIG.durationSec - elapsed;
    const memSnapshot = takeMemorySnapshot(`progress_${elapsed}s`);
    const memStr = memSnapshot ? ` | Mem: ${memSnapshot.heapUsedMB}MB` : '';
    console.log(`⏱️  ${elapsed}s elapsed | Sent: ${formatNumber(totalSent)} | Received: ${formatNumber(totalReceived)} | Reconnects: ${totalReconnections}${memStr} | Remaining: ${remaining}s`);
  }, 10000); // Every 10 seconds
  
  // Memory profiling interval (if enabled)
  let memoryInterval = null;
  if (CONFIG.enableMemoryProfiling && CONFIG.memoryProfileIntervalSec < 10) {
    memoryInterval = setInterval(() => {
      takeMemorySnapshot('periodic');
    }, CONFIG.memoryProfileIntervalSec * 1000);
  }
  
  // Wait for test duration
  console.log(`⏳ Running for ${CONFIG.durationSec} seconds...\n`);
  await new Promise(resolve => setTimeout(resolve, CONFIG.durationSec * 1000));
  
  // Stop all clients
  console.log('\n🛑 Stopping clients...');
  clients.forEach(client => client.stop());
  testEndTime = Date.now();
  takeMemorySnapshot('test_end');
  clearInterval(progressInterval);
  if (memoryInterval) clearInterval(memoryInterval);
  
  // Wait for stragglers
  console.log(`⏳ Waiting ${CONFIG.deliveryTimeoutMs}ms for stragglers...`);
  await new Promise(resolve => setTimeout(resolve, CONFIG.deliveryTimeoutMs));
  
  // Collect lost messages
  console.log('📊 Collecting final statistics...\n');
  clients.forEach(client => {
    const lost = client.getLostMessages();
    allMessages.push(...lost);
  });
  
  // Calculate statistics
  const percentiles = calculatePercentiles(allLatencies, [50, 95, 99]);
  const stats = calculateStats(allLatencies);
  const lossCount = totalSent - totalReceived;
  const lossPercent = totalSent > 0 ? (lossCount / totalSent) * 100 : 0;
  const actualDuration = (testEndTime - testStartTime) / 1000;
  const throughput = totalReceived / actualDuration;
  
  // Calculate Firestore operations and costs
  // Pricing: $0.06 per 100k reads, $0.18 per 100k writes (standard Firestore pricing)
  const firestoreWrites = totalSent; // Each message sent = 1 write
  const firestoreReads = totalReceived; // Each message received via snapshot = 1 read
  const writeCost = (firestoreWrites / 100000) * 0.18;
  const readCost = (firestoreReads / 100000) * 0.06;
  const totalCost = writeCost + readCost;
  const costPerMessage = totalSent > 0 ? totalCost / totalSent : 0;
  
  // Calculate latency by message size
  const latencyBySize = {};
  Object.entries(latenciesBySize).forEach(([size, latencies]) => {
    if (latencies.length > 0) {
      latencyBySize[size] = calculatePercentiles(latencies, [50, 95, 99]);
    }
  });
  
  // Memory stats
  const memoryStats = memorySnapshots.length > 0 ? {
    initial: memorySnapshots[0],
    peak: memorySnapshots.reduce((max, snap) => snap.heapUsedMB > max.heapUsedMB ? snap : max, memorySnapshots[0]),
    final: memorySnapshots[memorySnapshots.length - 1],
  } : null;
  
  // Per-client stats
  const clientStats = clients.map(c => c.getStats());
  
  // Write CSV
  console.log('💾 Writing results-datescape.csv...');
  const csvLines = ['ts_iso,matchId,clientId,msgId,latency_ms,delivered,sizeCategory'];
  allMessages.forEach(msg => {
    csvLines.push(`${msg.ts_iso},${msg.matchId},${msg.clientId},${msg.msgId},${msg.latency_ms},${msg.delivered},${msg.sizeCategory || 'small'}`);
  });
  fs.writeFileSync('results-datescape.csv', csvLines.join('\n'));
  
  // Write memory profile CSV
  if (CONFIG.enableMemoryProfiling && memorySnapshots.length > 0) {
    console.log('💾 Writing memory-profile.csv...');
    const memCsvLines = ['timestamp,label,heapUsedMB,heapTotalMB,externalMB,rssMB'];
    memorySnapshots.forEach(snap => {
      memCsvLines.push(`${snap.timestamp},${snap.label},${snap.heapUsedMB},${snap.heapTotalMB},${snap.externalMB},${snap.rssMB}`);
    });
    fs.writeFileSync('memory-profile.csv', memCsvLines.join('\n'));
  }
  
  // Write Markdown report
  console.log('💾 Writing results-datescape.md...\n');
  const mdReport = generateMarkdownReport({
    config: CONFIG,
    percentiles,
    stats,
    totalSent,
    totalReceived,
    lossCount,
    lossPercent,
    throughput,
    actualDuration,
    clientStats,
    firestoreWrites,
    firestoreReads,
    totalCost,
    costPerMessage,
    latencyBySize,
    messageSizeStats,
    memoryStats,
    totalReconnections,
    totalListenerErrors,
  });
  fs.writeFileSync('results-datescape.md', mdReport);
  
  // Print summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎉 BENCHMARK COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nDateScape chat benchmark — clients=${CONFIG.clients}, matches=${CONFIG.matchCount}, duration=${CONFIG.durationSec}s → p50=${percentiles.p50.toFixed(0)} ms | p95=${percentiles.p95.toFixed(0)} ms | p99=${percentiles.p99.toFixed(0)} ms | delivered=${formatNumber(totalReceived)}/${formatNumber(totalSent)} | loss=${lossPercent.toFixed(2)}% | throughput=${throughput.toFixed(2)} msg/s\n`);
  console.log(`💰 Firestore ops: ${formatNumber(firestoreReads)} reads / ${formatNumber(firestoreWrites)} writes → est. cost ≈ $${totalCost.toFixed(3)} for ${Math.floor(actualDuration / 60)} min load (≈ $${costPerMessage.toFixed(6)} / msg)\n`);
  
  if (memoryStats) {
    console.log(`🧠 Memory: Initial ${memoryStats.initial.heapUsedMB}MB → Peak ${memoryStats.peak.heapUsedMB}MB → Final ${memoryStats.final.heapUsedMB}MB\n`);
  }
  
  if (totalReconnections > 0) {
    console.log(`🔄 Connection stability: ${totalReconnections} reconnections, ${totalListenerErrors} errors\n`);
  }
  
  console.log('📁 Results written to:');
  console.log('   - results-datescape.csv');
  console.log('   - results-datescape.md');
  if (CONFIG.enableMemoryProfiling && memorySnapshots.length > 0) {
    console.log('   - memory-profile.csv');
  }
  console.log();
  
  // Force process exit (Windows Firestore listener cleanup issue)
  console.log('🏁 Benchmark complete! Exiting...\n');
  
  // Give a moment for final writes to complete
  setTimeout(() => {
    process.exit(0);
  }, 500);
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(data) {
  const {
    config,
    percentiles,
    stats,
    totalSent,
    totalReceived,
    lossCount,
    lossPercent,
    throughput,
    actualDuration,
    clientStats,
    firestoreWrites,
    firestoreReads,
    totalCost,
    costPerMessage,
    latencyBySize,
    messageSizeStats,
    memoryStats,
    totalReconnections,
    totalListenerErrors,
  } = data;
  
  const timestamp = new Date().toISOString();
  
  // Calculate per-match stats
  const matchGroups = {};
  clientStats.forEach(client => {
    if (!matchGroups[client.matchId]) {
      matchGroups[client.matchId] = { sent: 0, received: 0, clients: 0 };
    }
    matchGroups[client.matchId].sent += client.sent;
    matchGroups[client.matchId].received += client.received;
    matchGroups[client.matchId].clients++;
  });
  
  return `# DateScape Chat Benchmark Results

**Generated:** ${timestamp}

## Summary

\`\`\`
DateScape chat benchmark — clients=${config.clients}, matches=${config.matchCount}, duration=${config.durationSec}s → p50=${percentiles.p50.toFixed(0)} ms | p95=${percentiles.p95.toFixed(0)} ms | p99=${percentiles.p99.toFixed(0)} ms | delivered=${formatNumber(totalReceived)}/${formatNumber(totalSent)} | loss=${lossPercent.toFixed(2)}% | throughput=${throughput.toFixed(2)} msg/s
\`\`\`

## Configuration

| Parameter | Value |
|-----------|-------|
| Clients | ${config.clients} |
| Matches | ${config.matchCount} |
| Duration | ${config.durationSec}s (actual: ${actualDuration.toFixed(2)}s) |
| Send Interval | ${config.sendMinMs}-${config.sendMaxMs}ms |
| Delivery Timeout | ${config.deliveryTimeoutMs}ms |

## Latency Metrics

| Metric | Value |
|--------|-------|
| **p50 (median)** | ${percentiles.p50.toFixed(2)} ms |
| **p95** | ${percentiles.p95.toFixed(2)} ms |
| **p99** | ${percentiles.p99.toFixed(2)} ms |
| Min | ${stats.min.toFixed(2)} ms |
| Max | ${stats.max.toFixed(2)} ms |
| Mean | ${stats.mean.toFixed(2)} ms |

${latencyBySize && Object.keys(latencyBySize).length > 0 ? `
### Latency by Message Size

| Size Category | Count | p50 | p95 | p99 |
|---------------|-------|-----|-----|-----|
${Object.entries(latencyBySize).map(([size, perc]) => 
  `| ${size} | ${formatNumber(messageSizeStats[size] || 0)} | ${perc.p50.toFixed(2)} ms | ${perc.p95.toFixed(2)} ms | ${perc.p99.toFixed(2)} ms |`
).join('\n')}
` : ''}

## Message Delivery

| Metric | Value |
|--------|-------|
| Total Sent | ${formatNumber(totalSent)} |
| Total Received | ${formatNumber(totalReceived)} |
| **Message Loss** | **${formatNumber(lossCount)} (${lossPercent.toFixed(2)}%)** |
| **Throughput** | **${throughput.toFixed(2)} msg/s** |

## Per-Match Distribution

| Match ID | Clients | Sent | Received | Loss % |
|----------|---------|------|----------|--------|
${Object.entries(matchGroups).map(([matchId, data]) => {
  const loss = data.sent > 0 ? ((data.sent - data.received) / data.sent * 100).toFixed(2) : '0.00';
  return `| ${matchId} | ${data.clients} | ${formatNumber(data.sent)} | ${formatNumber(data.received)} | ${loss}% |`;
}).join('\n')}

## Top 10 Clients by Messages Sent

| Client ID | Match ID | Sent | Received | Loss % |
|-----------|----------|------|----------|--------|
${clientStats
  .sort((a, b) => b.sent - a.sent)
  .slice(0, 10)
  .map(client => {
    const loss = client.sent > 0 ? ((client.sent - client.received) / client.sent * 100).toFixed(2) : '0.00';
    return `| ${client.clientId} | ${client.matchId} | ${client.sent} | ${client.received} | ${loss}% |`;
  })
  .join('\n')}

## Firestore Operations & Cost

| Metric | Value |
|--------|-------|
| Total Reads | ${formatNumber(firestoreReads)} |
| Total Writes | ${formatNumber(firestoreWrites)} |
| Read Cost (@ $0.06/100k) | $${(firestoreReads / 100000 * 0.06).toFixed(4)} |
| Write Cost (@ $0.18/100k) | $${(firestoreWrites / 100000 * 0.18).toFixed(4)} |
| **Estimated Total Cost** | **$${totalCost.toFixed(3)}** |
| **Cost per Message** | **$${costPerMessage.toFixed(6)}** |

**Summary:** Firestore ops: ${formatNumber(firestoreReads)} reads / ${formatNumber(firestoreWrites)} writes → est. cost ≈ $${totalCost.toFixed(3)} for ${Math.floor(actualDuration / 60)} min load (≈ $${costPerMessage.toFixed(6)} / msg)

${memoryStats ? `
## Memory Profile

| Metric | Value |
|--------|-------|
| Initial Heap | ${memoryStats.initial.heapUsedMB} MB |
| Peak Heap | ${memoryStats.peak.heapUsedMB} MB |
| Final Heap | ${memoryStats.final.heapUsedMB} MB |
| Memory Growth | ${memoryStats.final.heapUsedMB - memoryStats.initial.heapUsedMB} MB (${((memoryStats.final.heapUsedMB / memoryStats.initial.heapUsedMB - 1) * 100).toFixed(1)}%) |
| Peak RSS | ${memoryStats.peak.rssMB} MB |

📊 **Memory efficiency:** ${(memoryStats.peak.heapUsedMB / (config.clients / 10)).toFixed(1)} MB per 10 clients
` : ''}

${totalReconnections > 0 || totalListenerErrors > 0 ? `
## Connection Stability

| Metric | Value |
|--------|-------|
| Total Reconnections | ${formatNumber(totalReconnections)} |
| Total Listener Errors | ${formatNumber(totalListenerErrors)} |
| Reconnection Rate | ${((totalReconnections / config.clients) * 100).toFixed(2)}% |
| Error Rate | ${((totalListenerErrors / (totalSent + totalReceived)) * 100).toFixed(4)}% |

${totalReconnections > 0 ? `⚠️ **${totalReconnections} reconnection events detected** - may indicate network instability or listener issues.` : '✅ **Excellent connection stability** - no reconnections detected.'}
` : ''}

## Disclaimer

⚠️ **Synthetic clients on staging; results are engineering baselines, not real-user traffic.**

This benchmark uses simulated clients to measure Firebase Firestore performance characteristics under controlled conditions. Results may vary based on:
- Network conditions
- Firebase region and configuration
- Time of day and system load
- Client distribution and message patterns

These metrics should be used for comparative analysis and system capacity planning, not as absolute performance guarantees.

**Cost Estimate Note:** Based on standard Firestore pricing ($0.06 per 100k reads, $0.18 per 100k writes). Actual costs may vary by region and pricing tier. Does not include storage, network egress, or other Firebase services.

---

*Generated by datescape-chat-benchmark v1.0.0*
`;
}

// Run the benchmark
runBenchmark().catch(error => {
  console.error('\n❌ Benchmark failed:', error);
  process.exit(1);
});

