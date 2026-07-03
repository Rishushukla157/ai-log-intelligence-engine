function parseApacheDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateDuration(firstSeen, lastSeen) {
  const start = parseApacheDate(firstSeen);
  const end = parseApacheDate(lastSeen);

  if (!start || !end) return "Unknown";

  const diffMs = end - start;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;

  if (hours > 0) return `${hours}h ${remainingMins}m`;
  return `${mins}m`;
}

function calculateDurationHours(firstSeen, lastSeen) {
  const start = parseApacheDate(firstSeen);
  const end = parseApacheDate(lastSeen);

  if (!start || !end) return 0;

  return Math.max((end - start) / (1000 * 60 * 60), 0);
}

function calculateIncidentConfidence({
  occurrences = 0,
  severity = "Unknown",
  relatedSignals = 0,
  patternTypes = 1,
  durationHours = 0,
  affectedComponents = 1
}) {
  const round = (value) => Math.round(value * 10) / 10;

  const occurrenceScore = Math.min((occurrences / 500) * 35, 35);

  const severityScoreMap = {
    Critical: 25,
    High: 22,
    Medium: 15,
    Low: 8,
    Unknown: 4
  };

  const severityScore = severityScoreMap[severity] || 4;

  const patternConsistencyScore = Math.min((patternTypes / 4) * 15, 15);

  const relatedSignalsScore = Math.min((relatedSignals / 2) * 15, 15);

  const durationScore = Math.min((durationHours / 36) * 10, 10);

  const componentCorrelationScore = Math.min(
    (affectedComponents / 3) * 10,
    10
  );

  const rawTotal =
    occurrenceScore +
    severityScore +
    patternConsistencyScore +
    relatedSignalsScore +
    durationScore +
    componentCorrelationScore;

  const total = Math.min(Math.round(rawTotal), 98);

  return {
    score: total,
    breakdown: {
      occurrenceScore: round(occurrenceScore),
      severityScore: round(severityScore),
      patternConsistencyScore: round(patternConsistencyScore),
      relatedSignalsScore: round(relatedSignalsScore),
      durationScore: round(durationScore),
      componentCorrelationScore: round(componentCorrelationScore),
      total
    }
  };
}

function getDominantErrorState(errorStates = {}) {
  const entries = Object.entries(errorStates);

  if (entries.length === 0) return null;

  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function buildConfidence(pattern, config) {
  return calculateIncidentConfidence({
    occurrences: pattern.count,
    severity: config.severity,
    relatedSignals: config.relatedSignals,
    patternTypes: config.patternTypes,
    durationHours: calculateDurationHours(pattern.firstSeen, pattern.lastSeen),
    affectedComponents: config.affectedComponents
  });
}

function createIncidentFromPattern(pattern) {
  if (pattern.patternType === "WORKER_FAILURE") {
    const confidence = buildConfidence(pattern, {
      severity: "High",
      relatedSignals: 2,
      patternTypes: 3,
      affectedComponents: 1
    });

    return {
      incidentType: "APACHE_WORKER_INSTABILITY",
      title: "Repeated Apache Worker Failure",
      severity: "High",
      affectedComponent: "mod_jk",
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
      duration: calculateDuration(pattern.firstSeen, pattern.lastSeen),
      occurrences: pattern.count,
      dominantErrorState: getDominantErrorState(pattern.errorStates),
      supportingLogReferences: pattern.supportingLogReferences,
      summary: `Apache mod_jk worker failures occurred ${pattern.count} times. The repeated workerEnv error-state pattern indicates persistent worker instability.`,
      impact:
        "Apache worker instability may cause failed request handling, backend communication issues, or intermittent service degradation.",
      recommendedAction:
        "Inspect mod_jk worker configuration, workers2.properties, Apache-Tomcat connector health, and restart unhealthy worker processes.",
      confidence: confidence.score,
      confidenceBreakdown: confidence.breakdown
    };
  }

  if (pattern.patternType === "SECURITY_ACCESS_DENIED") {
    const confidence = buildConfidence(pattern, {
      severity: "High",
      relatedSignals: 0,
      patternTypes: 1,
      affectedComponents: 1
    });

    return {
      incidentType: "SECURITY_ACCESS_CONTROL",
      title: "Repeated Access Control Denials",
      severity: "High",
      affectedComponent: "Apache Core",
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
      duration: calculateDuration(pattern.firstSeen, pattern.lastSeen),
      occurrences: pattern.count,
      dominantErrorState: null,
      supportingLogReferences: pattern.supportingLogReferences,
      summary: `Apache recorded ${pattern.count} access-control related event(s), mainly directory index forbidden or denied access attempts.`,
      impact:
        "This may indicate blocked directory listing attempts, misconfigured access rules, or suspicious probing behavior.",
      recommendedAction:
        "Review Apache directory permissions, disable unwanted directory listing, and inspect source IPs for suspicious activity.",
      confidence: confidence.score,
      confidenceBreakdown: confidence.breakdown
    };
  }

  if (pattern.patternType === "WORKER_REGISTRATION") {
    const confidence = buildConfidence(pattern, {
      severity: "Low",
      relatedSignals: 1,
      patternTypes: 1,
      affectedComponents: 1
    });

    return {
      incidentType: "WORKER_REGISTRATION_ACTIVITY",
      title: "High Volume Worker Registration",
      severity: "Low",
      affectedComponent: "JK Connector",
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
      duration: calculateDuration(pattern.firstSeen, pattern.lastSeen),
      occurrences: pattern.count,
      dominantErrorState: null,
      supportingLogReferences: pattern.supportingLogReferences,
      summary: `${pattern.count} worker registration event(s) were observed where Apache JK connector children were found in scoreboard slots.`,
      impact:
        "This is usually operational activity, but high volume together with worker failures may indicate worker churn.",
      recommendedAction:
        "Correlate worker registration frequency with worker failure incidents to confirm whether Apache is repeatedly replacing failed workers.",
      confidence: confidence.score,
      confidenceBreakdown: confidence.breakdown
    };
  }

  if (pattern.patternType === "WORKER_ENV_INIT") {
    const confidence = buildConfidence(pattern, {
      severity: "Low",
      relatedSignals: 1,
      patternTypes: 1,
      affectedComponents: 1
    });

    return {
      incidentType: "WORKER_ENV_INITIALIZATION",
      title: "Worker Environment Initialization Activity",
      severity: "Low",
      affectedComponent: "Apache Worker",
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
      duration: calculateDuration(pattern.firstSeen, pattern.lastSeen),
      occurrences: pattern.count,
      dominantErrorState: null,
      supportingLogReferences: pattern.supportingLogReferences,
      summary: `${pattern.count} worker environment initialization event(s) were detected from workers2.properties.`,
      impact:
        "This indicates Apache workers were repeatedly initialized. When paired with worker failures, it may indicate restart/recovery cycles.",
      recommendedAction:
        "Check whether worker initialization frequency aligns with expected Apache restart behavior.",
      confidence: confidence.score,
      confidenceBreakdown: confidence.breakdown
    };
  }

  return null;
}

function correlateIncidents(patternSummary) {
  const incidents = patternSummary
    .map(createIncidentFromPattern)
    .filter(Boolean)
    .sort((a, b) => {
      const severityWeight = { High: 3, Medium: 2, Low: 1 };
      return (
        severityWeight[b.severity] - severityWeight[a.severity] ||
        b.occurrences - a.occurrences
      );
    });

  const workerFailure = incidents.find(
    (i) => i.incidentType === "APACHE_WORKER_INSTABILITY"
  );

  const workerRegistration = incidents.find(
    (i) => i.incidentType === "WORKER_REGISTRATION_ACTIVITY"
  );

  const workerInit = incidents.find(
    (i) => i.incidentType === "WORKER_ENV_INITIALIZATION"
  );

  let primaryIncident = workerFailure || incidents[0] || null;

  if (primaryIncident && workerFailure) {
    primaryIncident.correlationInsight =
      "Worker failures, worker environment initialization, and JK connector registration appear together. This suggests a repeated worker restart or crash-loop pattern rather than isolated log events.";

    primaryIncident.relatedSignals = {
      workerRegistrations: workerRegistration?.occurrences || 0,
      workerInitializations: workerInit?.occurrences || 0
    };
  }

  return {
    primaryIncident,
    incidents,
    incidentCount: incidents.length
  };
}

module.exports = {
  correlateIncidents
};