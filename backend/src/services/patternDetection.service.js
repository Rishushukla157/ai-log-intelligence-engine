function normalizePattern(raw = "") {
  return raw
    .toLowerCase()
    .replace(/\[.*?\]/g, "")
    .replace(/\d+/g, "<num>")
    .replace(/\s+/g, " ")
    .trim();
}

function extractErrorState(raw = "") {
  const match = raw.match(/error state\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function detectPattern(log) {
  const text = log.raw.toLowerCase();

  if (text.includes("mod_jk") && text.includes("error state")) {
    return {
      patternType: "WORKER_FAILURE",
      patternName: "Apache Worker Failure",
      severity: "High",
      component: "mod_jk",
      errorState: extractErrorState(log.raw)
    };
  }

  if (text.includes("workerenv.init() ok")) {
    return {
      patternType: "WORKER_ENV_INIT",
      patternName: "Worker Environment Initialization",
      severity: "Low",
      component: "Apache Worker",
      errorState: null
    };
  }

  if (text.includes("jk2_init") && text.includes("found child")) {
    return {
      patternType: "WORKER_REGISTRATION",
      patternName: "Worker Process Registration",
      severity: "Low",
      component: "JK Connector",
      errorState: null
    };
  }

  if (
    text.includes("directory index forbidden") ||
    text.includes("forbidden") ||
    text.includes("denied") ||
    text.includes("permission")
  ) {
    return {
      patternType: "SECURITY_ACCESS_DENIED",
      patternName: "Access Control Violation",
      severity: "High",
      component: "Apache Core",
      errorState: null
    };
  }

  return {
    patternType: "GENERAL_OPERATIONAL",
    patternName: "General Apache Operational Event",
    severity: log.severity || "Unknown",
    component: log.component || "Apache",
    errorState: null
  };
}

function detectPatterns(logs) {
  return logs.map((log) => {
    const pattern = detectPattern(log);

    return {
      logId: log.id,
      timestamp: log.timestamp,
      raw: log.raw,
      level: log.level,
      category: log.category,
      severity: pattern.severity,
      component: pattern.component,
      patternType: pattern.patternType,
      patternName: pattern.patternName,
      errorState: pattern.errorState,
      signature: normalizePattern(log.raw)
    };
  });
}

function buildPatternSummary(patterns) {
  const summary = {};

  for (const pattern of patterns) {
    if (!summary[pattern.patternType]) {
      summary[pattern.patternType] = {
        patternType: pattern.patternType,
        patternName: pattern.patternName,
        count: 0,
        severity: pattern.severity,
        component: pattern.component,
        firstSeen: pattern.timestamp,
        lastSeen: pattern.timestamp,
        supportingLogReferences: [],
        errorStates: {}
      };
    }

    const item = summary[pattern.patternType];

    item.count += 1;
    item.lastSeen = pattern.timestamp;

    if (item.supportingLogReferences.length < 20) {
      item.supportingLogReferences.push(pattern.logId);
    }

    if (pattern.errorState !== null) {
      item.errorStates[pattern.errorState] =
        (item.errorStates[pattern.errorState] || 0) + 1;
    }
  }

  return Object.values(summary).sort((a, b) => b.count - a.count);
}

module.exports = {
  detectPatterns,
  buildPatternSummary
};