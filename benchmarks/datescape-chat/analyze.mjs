import fs from 'fs';
import { calculatePercentiles, calculateStats, formatMs, formatNumber } from './percentiles.mjs';

/**
 * Parse CSV file and recompute statistics
 */
function analyzeResults() {
  console.log('📊 Analyzing results-datescape.csv...\n');
  
  // Check if CSV exists
  if (!fs.existsSync('results-datescape.csv')) {
    console.error('❌ results-datescape.csv not found. Run the benchmark first with: npm run bench');
    process.exit(1);
  }
  
  // Read and parse CSV
  const csvContent = fs.readFileSync('results-datescape.csv', 'utf-8');
  const lines = csvContent.split('\n');
  const header = lines[0];
  const dataLines = lines.slice(1).filter(line => line.trim());
  
  console.log(`📄 Found ${dataLines.length} message records\n`);
  
  // Parse data
  const messages = [];
  const latencies = [];
  const clientStats = {};
  const matchStats = {};
  let totalSent = 0;
  let totalReceived = 0;
  
  dataLines.forEach(line => {
    const [ts_iso, matchId, clientId, msgId, latency_ms, delivered] = line.split(',');
    
    const msg = {
      ts_iso,
      matchId,
      clientId: parseInt(clientId),
      msgId,
      latency_ms: parseFloat(latency_ms),
      delivered: delivered === 'true',
    };
    
    messages.push(msg);
    
    // Track client stats
    if (!clientStats[clientId]) {
      clientStats[clientId] = { clientId: parseInt(clientId), matchId, sent: 0, received: 0, latencies: [] };
    }
    
    if (msg.delivered) {
      totalReceived++;
      clientStats[clientId].received++;
      if (msg.latency_ms > 0) {
        latencies.push(msg.latency_ms);
        clientStats[clientId].latencies.push(msg.latency_ms);
      }
    } else {
      totalSent++; // Lost message
    }
    
    // Track match stats
    if (!matchStats[matchId]) {
      matchStats[matchId] = { sent: 0, received: 0, clients: new Set() };
    }
    matchStats[matchId].clients.add(clientId);
    if (msg.delivered) {
      matchStats[matchId].received++;
    }
  });
  
  // Calculate total sent (received + lost)
  totalSent = totalReceived + messages.filter(m => !m.delivered).length;
  
  // Count sent messages for clients (received + their lost messages)
  Object.values(clientStats).forEach(client => {
    const lostForClient = messages.filter(m => !m.delivered && m.clientId === client.clientId).length;
    client.sent = client.received + lostForClient;
  });
  
  // Calculate match sent
  Object.entries(matchStats).forEach(([matchId, stats]) => {
    const matchMessages = messages.filter(m => m.matchId === matchId);
    stats.sent = matchMessages.length;
    stats.clients = stats.clients.size;
  });
  
  // Calculate statistics
  const percentiles = calculatePercentiles(latencies, [50, 95, 99]);
  const stats = calculateStats(latencies);
  const lossCount = totalSent - totalReceived;
  const lossPercent = totalSent > 0 ? (lossCount / totalSent) * 100 : 0;
  
  // Estimate duration from timestamps
  const timestamps = messages
    .filter(m => m.ts_iso)
    .map(m => new Date(m.ts_iso).getTime())
    .sort((a, b) => a - b);
  const durationMs = timestamps.length > 0 ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const durationSec = durationMs / 1000;
  const throughput = durationSec > 0 ? totalReceived / durationSec : 0;
  
  // Calculate Firestore costs
  const firestoreWrites = totalSent;
  const firestoreReads = totalReceived;
  const writeCost = (firestoreWrites / 100000) * 0.18;
  const readCost = (firestoreReads / 100000) * 0.06;
  const totalCost = writeCost + readCost;
  const costPerMessage = totalSent > 0 ? totalCost / totalSent : 0;
  
  // Get client count and match count
  const clientCount = Object.keys(clientStats).length;
  const matchCount = Object.keys(matchStats).length;
  
  // Generate new report
  const mdReport = generateAnalysisReport({
    percentiles,
    stats,
    totalSent,
    totalReceived,
    lossCount,
    lossPercent,
    throughput,
    durationSec,
    clientCount,
    matchCount,
    clientStats: Object.values(clientStats),
    matchStats,
    firestoreWrites,
    firestoreReads,
    totalCost,
    costPerMessage,
  });
  
  // Write updated report
  fs.writeFileSync('results-datescape-reanalyzed.md', mdReport);
  
  // Print summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nDateScape chat benchmark (reanalyzed) — clients=${clientCount}, matches=${matchCount}, duration=${Math.floor(durationSec)}s → p50=${percentiles.p50.toFixed(0)} ms | p95=${percentiles.p95.toFixed(0)} ms | p99=${percentiles.p99.toFixed(0)} ms | delivered=${formatNumber(totalReceived)}/${formatNumber(totalSent)} | loss=${lossPercent.toFixed(2)}% | throughput=${throughput.toFixed(2)} msg/s\n`);
  console.log(`💰 Firestore ops: ${formatNumber(firestoreReads)} reads / ${formatNumber(firestoreWrites)} writes → est. cost ≈ $${totalCost.toFixed(3)} for ${Math.floor(durationSec / 60)} min load (≈ $${costPerMessage.toFixed(6)} / msg)\n`);
  console.log('📁 Report written to: results-datescape-reanalyzed.md\n');
  
  // Force exit
  process.exit(0);
}

/**
 * Generate analysis markdown report
 */
function generateAnalysisReport(data) {
  const {
    percentiles,
    stats,
    totalSent,
    totalReceived,
    lossCount,
    lossPercent,
    throughput,
    durationSec,
    clientCount,
    matchCount,
    clientStats,
    matchStats,
    firestoreWrites,
    firestoreReads,
    totalCost,
    costPerMessage,
  } = data;
  
  const timestamp = new Date().toISOString();
  
  return `# DateScape Chat Benchmark Results (Reanalyzed)

**Generated:** ${timestamp}  
**Source:** results-datescape.csv

## Summary

\`\`\`
DateScape chat benchmark — clients=${clientCount}, matches=${matchCount}, duration=${Math.floor(durationSec)}s → p50=${percentiles.p50.toFixed(0)} ms | p95=${percentiles.p95.toFixed(0)} ms | p99=${percentiles.p99.toFixed(0)} ms | delivered=${formatNumber(totalReceived)}/${formatNumber(totalSent)} | loss=${lossPercent.toFixed(2)}% | throughput=${throughput.toFixed(2)} msg/s
\`\`\`

## Configuration (Inferred)

| Parameter | Value |
|-----------|-------|
| Clients | ${clientCount} |
| Matches | ${matchCount} |
| Duration | ${Math.floor(durationSec)}s (${(durationSec / 60).toFixed(1)} min) |

## Latency Metrics

| Metric | Value |
|--------|-------|
| **p50 (median)** | ${percentiles.p50.toFixed(2)} ms |
| **p95** | ${percentiles.p95.toFixed(2)} ms |
| **p99** | ${percentiles.p99.toFixed(2)} ms |
| Min | ${stats.min.toFixed(2)} ms |
| Max | ${stats.max.toFixed(2)} ms |
| Mean | ${stats.mean.toFixed(2)} ms |

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
${Object.entries(matchStats).map(([matchId, data]) => {
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

**Summary:** Firestore ops: ${formatNumber(firestoreReads)} reads / ${formatNumber(firestoreWrites)} writes → est. cost ≈ $${totalCost.toFixed(3)} for ${Math.floor(durationSec / 60)} min load (≈ $${costPerMessage.toFixed(6)} / msg)

## Disclaimer

⚠️ **This is a reanalysis of previously collected benchmark data.**

Original data was collected using synthetic clients on staging. Results are engineering baselines, not real-user traffic.

**Cost Estimate Note:** Based on standard Firestore pricing ($0.06 per 100k reads, $0.18 per 100k writes). Actual costs may vary by region and pricing tier. Does not include storage, network egress, or other Firebase services.

---

*Generated by datescape-chat-benchmark v1.0.0 (analyze)*
`;
}

// Run the analysis
analyzeResults();

