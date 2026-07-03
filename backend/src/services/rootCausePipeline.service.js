const {
  detectPatterns,
  buildPatternSummary
} = require("./patternDetection.service");

const {
  correlateIncidents
} = require("./incidentCorrelation.service");

function buildCauseEffectChain(primaryIncident) {
  if (primaryIncident.incidentType === "APACHE_WORKER_INSTABILITY") {
    return [
      "JK connector workers were repeatedly registered in Apache scoreboard slots.",
      "Worker environment initialization repeatedly occurred through workers2.properties.",
      "mod_jk child workerEnv repeatedly entered error states.",
      "The repeated error-state pattern indicates Apache worker instability or crash-loop behavior.",
      "This may cause intermittent request failures or backend communication degradation."
    ];
  }

  if (primaryIncident.incidentType === "SECURITY_ACCESS_CONTROL") {
    return [
      "Apache received requests targeting restricted directory paths.",
      "Directory index access was forbidden by Apache access-control rules.",
      "Repeated access denials indicate expected blocking, misconfiguration, or probing activity.",
      "Some client requests were blocked before reaching the application."
    ];
  }

  return [
    "Logs were parsed into operational events.",
    "Related patterns were grouped into incidents.",
    "The highest-confidence incident was selected as the probable root cause."
  ];
}

function buildRootCausePipeline(logs) {
  const detectedPatterns = detectPatterns(logs);
  const patternSummary = buildPatternSummary(detectedPatterns);
  const incidentCorrelation = correlateIncidents(patternSummary);

  const primaryIncident = incidentCorrelation.primaryIncident;

  if (!primaryIncident) {
    return {
      rootCause: "No strong root cause detected from the provided logs.",
      supportingEvidence: [],
      impact: "No clear operational impact could be determined.",
      recommendedAction:
        "Review additional logs or provide a larger related log window.",
      confidence: 40,
      severity: "Unknown",
      affectedComponent: "Unknown",
      confidenceBreakdown: null,
      causeEffectChain: [],
      analysisMode: "Deterministic RCA Engine",
      primaryIncident: null,
      detectedIncidents: [],
      patternSummary
    };
  }

  let rootCause;
  let supportingEvidence = [];
  let impact;
  let recommendedAction;

  if (primaryIncident.incidentType === "APACHE_WORKER_INSTABILITY") {
    rootCause =
      "Persistent Apache mod_jk worker instability caused repeated workerEnv error states.";

    supportingEvidence = [
      `${primaryIncident.occurrences} mod_jk worker failure events were detected.`,
      `Dominant worker error state is ${primaryIncident.dominantErrorState}.`,
      `Worker failures occurred from ${primaryIncident.firstSeen} to ${primaryIncident.lastSeen}.`,
      `Related signals show ${
        primaryIncident.relatedSignals?.workerRegistrations || 0
      } worker registrations and ${
        primaryIncident.relatedSignals?.workerInitializations || 0
      } worker initializations.`,
      `Sample supporting log references: ${primaryIncident.supportingLogReferences.join(
        ", "
      )}`
    ];

    impact =
      "Users may experience intermittent request failures, degraded application availability, or unstable backend communication because Apache workers repeatedly enter error states.";

    recommendedAction =
      "Inspect mod_jk and workers2.properties configuration, verify Apache-Tomcat connector health, check backend service availability, and restart or recycle unhealthy Apache worker processes.";
  } else if (primaryIncident.incidentType === "SECURITY_ACCESS_CONTROL") {
    rootCause =
      "Repeated Apache access-control denials were caused by directory permission or directory-index restrictions.";

    supportingEvidence = [
      `${primaryIncident.occurrences} access-control related events were detected.`,
      `Security events occurred from ${primaryIncident.firstSeen} to ${primaryIncident.lastSeen}.`,
      `Sample supporting log references: ${primaryIncident.supportingLogReferences.join(
        ", "
      )}`
    ];

    impact =
      "Some client requests were blocked. This may be expected security behavior, misconfiguration, or suspicious directory probing.";

    recommendedAction =
      "Review Apache directory permissions, verify DirectoryIndex settings, disable unwanted directory listing, and inspect source IPs for repeated probing.";
  } else {
    rootCause = primaryIncident.summary;

    supportingEvidence = [
      `${primaryIncident.occurrences} related events detected.`,
      `Affected component: ${primaryIncident.affectedComponent}`,
      `First seen: ${primaryIncident.firstSeen}`,
      `Last seen: ${primaryIncident.lastSeen}`,
      `Sample supporting log references: ${primaryIncident.supportingLogReferences.join(
        ", "
      )}`
    ];

    impact = primaryIncident.impact;
    recommendedAction = primaryIncident.recommendedAction;
  }

  return {
    rootCause,
    supportingEvidence,
    impact,
    recommendedAction,
    confidence: primaryIncident.confidence,
    severity: primaryIncident.severity,
    affectedComponent: primaryIncident.affectedComponent,
    confidenceBreakdown: primaryIncident.confidenceBreakdown,
    causeEffectChain: buildCauseEffectChain(primaryIncident),
    analysisMode:
      "Deterministic RCA Engine with Pattern Detection, Incident Correlation, and Dynamic Confidence",
    primaryIncident,
    detectedIncidents: incidentCorrelation.incidents,
    patternSummary
  };
}

module.exports = {
  buildRootCausePipeline
};