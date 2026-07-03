const { enrichLog } = require("./logParser.service");

function getSeverityScore(severity) {
  const map = {
    Critical: 100,
    High: 80,
    Medium: 50,
    Low: 20,
    Unknown: 10
  };

  return map[severity] || 10;
}

function getCategoryScore(category) {
  const map = {
    Security: 100,
    "Worker Failure": 95,
    Error: 90,
    "Backend Communication": 85,
    Performance: 80,
    "Worker Initialization": 70,
    Warning: 60,
    Configuration: 45,
    Shutdown: 40,
    Startup: 30,
    Unknown: 10
  };

  return map[category] || 10;
}

function normalizeMessage(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/\[.*?\]/g, "")
    .replace(/\d+/g, "<num>")
    .replace(/\s+/g, " ")
    .trim();
}

function removeDuplicates(enrichedLogs) {
  const seen = new Map();

  for (const log of enrichedLogs) {
    const signature = normalizeMessage(log.raw);

    if (!seen.has(signature)) {
      seen.set(signature, {
        ...log,
        duplicateCount: 1
      });
    } else {
      const existing = seen.get(signature);
      existing.duplicateCount += 1;
    }
  }

  return Array.from(seen.values());
}

function clusterLogs(logs) {
  const clusters = {};

  for (const log of logs) {
    const key = `${log.category}::${log.component}`;

    if (!clusters[key]) {
      clusters[key] = {
        clusterId: Object.keys(clusters).length + 1,
        category: log.category,
        component: log.component,
        severity: log.severity,
        logs: [],
        count: 0,
        maxSeverityScore: 0,
        tags: new Set()
      };
    }

    const cluster = clusters[key];

    cluster.logs.push(log);
    cluster.count += log.duplicateCount || 1;
    cluster.maxSeverityScore = Math.max(
      cluster.maxSeverityScore,
      getSeverityScore(log.severity)
    );

    log.tags?.forEach((tag) => cluster.tags.add(tag));
  }

  return Object.values(clusters).map((cluster) => ({
    ...cluster,
    tags: Array.from(cluster.tags),
    riskScore:
      cluster.maxSeverityScore +
      getCategoryScore(cluster.category) +
      Math.min(cluster.count * 2, 30)
  }));
}

function pickRepresentativeLogs(clusters, topK = 20) {
  const sortedClusters = [...clusters].sort(
    (a, b) => b.riskScore - a.riskScore
  );

  const representatives = [];

  for (const cluster of sortedClusters) {
    const sortedLogs = [...cluster.logs].sort((a, b) => {
      const scoreA =
        getSeverityScore(a.severity) +
        getCategoryScore(a.category) +
        (a.tags?.length || 0) * 5;

      const scoreB =
        getSeverityScore(b.severity) +
        getCategoryScore(b.category) +
        (b.tags?.length || 0) * 5;

      return scoreB - scoreA;
    });

    const representativeLog = sortedLogs[0];

    if (!representativeLog) continue;

    representatives.push({
      id: representativeLog.id,
      logId: representativeLog.id,
      raw: representativeLog.raw,
      rawLog: representativeLog.raw,
      timestamp: representativeLog.timestamp,
      level: representativeLog.level,

      clusterId: cluster.clusterId,
      category: cluster.category,
      component: cluster.component,
      severity: representativeLog.severity,
      clusterCount: cluster.count,
      duplicateCount: representativeLog.duplicateCount || 1,
      riskScore: cluster.riskScore,
      tags: cluster.tags,

      localPrediction: {
        category: representativeLog.category,
        severity: representativeLog.severity,
        component: representativeLog.component,
        confidence: representativeLog.confidence
      }
    });

    if (representatives.length >= topK) break;
  }

  return representatives;
}

function buildClassificationPipeline(rawLogs, options = {}) {
  const maxRepresentatives = options.maxRepresentatives || 20;

  const enrichedLogs = rawLogs.map((log, index) => enrichLog(log, index));
  const uniqueLogs = removeDuplicates(enrichedLogs);
  const clusters = clusterLogs(uniqueLogs);
  const representatives = pickRepresentativeLogs(clusters, maxRepresentatives);

  return {
    pipeline: {
      totalInputLogs: rawLogs.length,
      enrichedLogs: enrichedLogs.length,
      uniquePatterns: uniqueLogs.length,
      clusters: clusters.length,
      representativesSelected: representatives.length,
      strategy:
        "Parse → Enrich → Deduplicate → Cluster → Risk Rank → LLM Context Selection"
    },
    representatives,
    clusters: clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      category: cluster.category,
      component: cluster.component,
      severity: cluster.severity,
      count: cluster.count,
      riskScore: cluster.riskScore,
      tags: cluster.tags
    }))
  };
}

module.exports = {
  buildClassificationPipeline
};