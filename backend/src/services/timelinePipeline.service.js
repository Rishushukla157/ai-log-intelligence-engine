const {
  detectPatterns,
  buildPatternSummary
} = require("./patternDetection.service");

const {
  correlateIncidents
} = require("./incidentCorrelation.service");

function safeDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCategoryFromIncident(incidentType) {
  if (incidentType === "SECURITY_ACCESS_CONTROL") return "Security";
  if (incidentType === "APACHE_WORKER_INSTABILITY") return "Worker Failure";
  if (incidentType === "WORKER_REGISTRATION_ACTIVITY") return "Worker Registration";
  if (incidentType === "WORKER_ENV_INITIALIZATION") return "Worker Initialization";

  return "Operational";
}

function buildTimelineFromIncidents(incidentCorrelation) {
  const timeline = [];

  for (const incident of incidentCorrelation.incidents) {
    timeline.push({
      timestamp: incident.firstSeen,
      endTimestamp: incident.lastSeen,
      eventTitle: incident.title,
      phaseType: incident.incidentType,
      summary: incident.summary,
      severity: incident.severity,
      category: getCategoryFromIncident(incident.incidentType),
      component: incident.affectedComponent,
      affectedComponents: [incident.affectedComponent],
      incidentScore: incident.confidence,
      eventCount: incident.occurrences,
      duration: incident.duration,
      dominantErrorState: incident.dominantErrorState,
      supportingLogReferences: Array.isArray(incident.supportingLogReferences)
  ? incident.supportingLogReferences.slice(0, 5)
  : [],
      analystNote: incident.correlationInsight || incident.impact,
      recommendedAction: incident.recommendedAction,
      relatedSignals: incident.relatedSignals || null
    });
  }

  return timeline.sort((a, b) => {
    const dateA = safeDate(a.timestamp);
    const dateB = safeDate(b.timestamp);

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    return dateA - dateB;
  });
}

function buildIncidentTimelinePipeline(logs) {
  const detectedPatterns = detectPatterns(logs);
  const patternSummary = buildPatternSummary(detectedPatterns);
  const incidentCorrelation = correlateIncidents(patternSummary);
  const timelineContext = buildTimelineFromIncidents(incidentCorrelation);

  return {
    timelineMeta: {
      totalLogsAnalyzed: logs.length,
      detectedPatternEvents: detectedPatterns.length,
      uniquePatternTypes: patternSummary.length,
      correlatedIncidents: incidentCorrelation.incidentCount,
      selectedTimelineEvents: timelineContext.length,
      strategy:
        "Pattern detection → incident correlation → repeated event compression → incident narrative timeline"
    },
    patternSummary,
    detectedIncidents: incidentCorrelation.incidents,
    primaryIncident: incidentCorrelation.primaryIncident,
    timelineContext
  };
}

module.exports = {
  buildIncidentTimelinePipeline
};