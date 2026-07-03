const axios = require("axios");

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:latest";

async function callOllama(prompt) {
  const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
    format: "json",
    options: {
      temperature: 0,
      top_p: 0.1,
      num_predict: 900
    }
  });

  return response.data.response;
}

function extractJsonObject(text) {
  if (!text) return "{}";

  let cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first !== -1 && last !== -1) {
    cleaned = cleaned.slice(first, last + 1);
  }

  return cleaned;
}

async function parseOllamaJson(prompt) {
  const result = await callOllama(prompt);
  const cleaned = extractJsonObject(result);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Invalid Ollama JSON:");
    console.error(cleaned);
    throw error;
  }
}

function extractRawLogFromRepresentative(item) {
  if (!item) return "";

  if (typeof item.raw === "string") return item.raw;
  if (typeof item.rawLog === "string") return item.rawLog;
  if (typeof item.log === "string") return item.log;

  if (item.raw && typeof item.raw.raw === "string") return item.raw.raw;
  if (item.sourceLog && typeof item.sourceLog.raw === "string") {
    return item.sourceLog.raw;
  }

  return "";
}

function extractTimestampFromRepresentative(item) {
  if (!item) return null;

  if (item.timestamp) return item.timestamp;
  if (item.raw && item.raw.timestamp) return item.raw.timestamp;
  if (item.sourceLog && item.sourceLog.timestamp) return item.sourceLog.timestamp;

  return null;
}

function extractLevelFromRepresentative(item) {
  if (!item) return "unknown";

  if (item.level) return item.level;
  if (item.raw && item.raw.level) return item.raw.level;
  if (item.sourceLog && item.sourceLog.level) return item.sourceLog.level;

  return "unknown";
}

async function classifySingleLogWithAI(logItem) {
  const prompt = `
You are an Apache log classification engine.

Classify this ONE Apache log.

Return valid JSON only.

JSON format:
{
  "logId": 1,
  "rawLog": "original log",
  "category": "Startup",
  "severity": "Low",
  "confidence": 90,
  "explanation": "short reason",
  "recommendedAction": "short action"
}

Allowed category values:
Startup, Shutdown, Configuration, Worker Initialization, Backend Communication, Warning, Error, Performance, Security, Unknown.

Allowed severity values:
Low, Medium, High, Critical, Unknown.

Rules:
- Pick exactly ONE category.
- Do not use multiple categories separated by |.
- Do not invent logs.
- Return JSON only.

Important category priority:
If a log contains "workerEnv in error state" or "mod_jk child workerEnv in error state",
the category MUST be "Worker Failure", not "Error" and not "Worker Initialization".

Allowed Categories:
Startup, Shutdown, Configuration, Worker Initialization, Worker Failure, Backend Communication, Performance, Security, Warning, Error, Unknown.
Log:
${JSON.stringify(logItem, null, 2)}
`;

  return parseOllamaJson(prompt);
}

async function classifyLogsWithAI(pipelineContext) {
  const representatives = pipelineContext.representatives || [];

  const selectedLogs = representatives.slice(0, 7).map((item, index) => ({
    logId: item.id || item.logId || index + 1,
    rawLog: extractRawLogFromRepresentative(item),
    timestamp: extractTimestampFromRepresentative(item),
    level: extractLevelFromRepresentative(item),
    component: item.component || item.raw?.component || item.sourceLog?.component || "Apache"
  }));

  const results = [];

  for (const logItem of selectedLogs) {
    if (!logItem.rawLog) continue;

    const result = await classifySingleLogWithAI(logItem);

    results.push({
  logId: logItem.logId,

  // Preserve original backend values
  rawLog: logItem.rawLog,
  timestamp: logItem.timestamp,
  level: logItem.level,
  component: logItem.component || result.component || "Apache",

  // Let LLM decide these
  category: result.category || "Unknown",
  severity: result.severity || "Unknown",
  confidence: result.confidence || 70,
  explanation:
    result.explanation ||
    "AI classified this log using selected representative Apache log context.",
  recommendedAction:
    result.recommendedAction ||
    "Review this log and correlate it with nearby Apache events."
});
  }

  return {
    pipelineInsight: `The preprocessing pipeline selected ${results.length} representative log(s) from ${pipelineContext.pipeline?.totalInputLogs || "the input"} log(s) for LLM classification.`,
    results
  };
}

async function generateTimelineWithAI(timelinePipeline) {
  const events = (timelinePipeline.timelineContext || []).slice(0, 4).map((e) => ({
    timestamp: e.timestamp,
    eventTitle: e.eventTitle,
    summary: e.summary,
    severity: e.severity,
    category: e.category,
    component: e.component,
    supportingLogReferences: Array.isArray(e.supportingLogReferences)
      ? e.supportingLogReferences.slice(0, 5)
      : []
  }));

  const prompt = `
You are a Senior Site Reliability Engineer (SRE), Incident Commander, and Infrastructure Operations Analyst.

The preprocessing engine has already processed thousands of Apache logs.

It has already:
- Parsed the raw logs
- Normalized timestamps
- Correlated related incidents
- Removed duplicate events
- Clustered similar failures
- Ranked incidents by operational risk
- Selected only the highest-impact representative timeline events


Your responsibility is ONLY to reason about these selected events and reconstruct the incident timeline.

DO NOT invent new events.
DO NOT modify timestamps.
DO NOT remove supporting references.


----------------------------------------------------
OBJECTIVE
----------------------------------------------------

Generate a professional incident timeline describing how the incident evolved.

For each event explain:

• What happened?
• Why it happened?
• Which component was affected?
• What component was involved?
• What operational impact occurred?
• What should engineers do next?

----------------------------------------------------
RULES
----------------------------------------------------

1. Return ONLY valid JSON.
2. Do NOT use markdown.
3. Do NOT explain outside JSON.
4. Preserve timestamps EXACTLY.
5. Preserve event titles unless improvement is necessary.
6. Keep chronological order.
7. Use ONLY supplied incident events.
8. Do NOT invent new incidents.
9. Do NOT merge unrelated incidents.
10. Every timeline object MUST contain supportingLogReferences.
11. supportingLogReferences MUST be copied EXACTLY from the corresponding input event.
12. supportingLogReferences MUST always be an array of integers.
13. analystNote MUST NOT be empty.
14. recommendedAction MUST NOT be empty.
15. component MUST NOT be "Unknown" if it can be inferred from the event.
16. Keep summaries concise (maximum 20 words).

----------------------------------------------------
Return JSON

{
  "incidentSummary":"A concise executive summary of the overall incident.",

  "timeline":[
    {
      "timestamp":"",
      "eventTitle":"",
      "summary":"",
      "severity":"",
      "category":"",
      "component":"",
      "supportingLogReferences":[1,2,3],
      "analystNote":"",
      "recommendedAction":""
    }
  ]
}
----------------------------------------------------
IMPORTANT

The value of supportingLogReferences MUST be copied exactly from the input event.

Example:

Input:
{
   "supportingLogReferences":[2,9,10]
}

Output:
"supportingLogReferences":[2,9,10]

Do NOT replace it with:
[]
null
"N/A"

Every timeline object MUST contain EXACTLY these 9 fields.

If you cannot determine analystNote or recommendedAction,
generate a reasonable value.

Never leave them empty.

Never omit them.


----------------------------------------------------
Incident Events

${JSON.stringify(events,null,2)}
`;

  return parseOllamaJson(prompt);
}

async function rootCauseWithAI(rcaPipeline) {
  const compactContext = {
    rootCause: rcaPipeline.rootCause,
    supportingEvidence: rcaPipeline.supportingEvidence,
    impact: rcaPipeline.impact,
    recommendedAction: rcaPipeline.recommendedAction,
    confidence: rcaPipeline.confidence,
    severity: rcaPipeline.severity,
    affectedComponent: rcaPipeline.affectedComponent
  };

  const prompt = `
You are a Principal SRE and Root Cause Analysis expert.

The preprocessing engine has already:

- Parsed thousands of Apache logs.
- Removed duplicates.
- Correlated failures.
- Identified incident patterns.
- Ranked probable root causes.

Your job is to independently verify the evidence and determine the most probable root cause.

----------------------------------------------------
OBJECTIVE
----------------------------------------------------

Perform a production-grade Root Cause Analysis.

Explain

1. Root Cause
2. Supporting Evidence
3. Why this is the most likely cause
4. Operational Impact
5. Recommended Remediation
6. Confidence

----------------------------------------------------
RULES
----------------------------------------------------

- Use ONLY supplied evidence.
- Do not invent evidence.
- Do not invent logs.
- Return ONLY JSON.
- No markdown.

----------------------------------------------------
Return JSON

{
    "rootCause":"",
    "supportingEvidence":[
        "",
        "",
        ""
    ],
    "impact":"",
    "recommendedAction":"",
    "confidence":95,
    "severity":"Critical",
    "affectedComponent":""
}

----------------------------------------------------
Evidence

${JSON.stringify(compactContext,null,2)}
`;

  return parseOllamaJson(prompt);
}

async function generateAnalystSummary(context, featureType) {
  const prompt = `
You are a Senior Security Operations Center (SOC) analyst.

The preprocessing engine has already analyzed thousands of Apache logs.

Summarize the findings for another engineer.

Explain:

- What happened?
- Which components are most affected?
- What is the overall risk?
- What should engineers investigate first?

Keep it under 120 words.

Return ONLY JSON.

{
   "aiAnalystSummary":"..."
}

Context:

${JSON.stringify(context,null,2)}
`;

  return parseOllamaJson(prompt);
}

module.exports = {
  classifyLogsWithAI,
  generateTimelineWithAI,
  rootCauseWithAI,
  generateAnalystSummary
};