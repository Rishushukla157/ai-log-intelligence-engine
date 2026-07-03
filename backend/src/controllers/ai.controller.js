const { sendResponse } = require("../utils/response");

const {
  loadLogsFromUploadedFile
} = require("../services/inputAdapter.service");

const {
  buildRootCausePipeline
} = require("../services/rootCausePipeline.service");

const {
  parseLogsFromText,
  loadLogsFromFile,
  enrichLog
} = require("../services/logParser.service");

const {
  normalizeInputLogs
} = require("../services/context.service");

const {
  classifyLogsWithAI,
  generateTimelineWithAI,
  rootCauseWithAI,  
  generateAnalystSummary
} = require("../services/ai.service");

const {
  buildClassificationPipeline
} = require("../services/classificationPipeline.service");

const {
  buildIncidentTimelinePipeline
} = require("../services/timelinePipeline.service");

async function loadDataset(req, res) {
  const startTime = Date.now();

  try {
    const logs = req.app.locals.uploadedLogs || loadLogsFromFile();

    return sendResponse(
      res,
      true,
      "Dataset loaded successfully",
      {
        dataSource: req.app.locals.uploadedLogs
          ? "Uploaded Dataset"
          : "Apache_2k.log Dataset",
        totalLogs: logs.length,
        sampleLogs: logs.slice(0, 50)
      },
      startTime
    );
  } catch (error) {
    return sendResponse(res, false, error.message, null, startTime);
  }
}

async function uploadDataset(req, res) {
  const startTime = Date.now();

  try {
    if (!req.file) {
      return sendResponse(res, false, "No file uploaded", null, startTime);
    }

    const logs = loadLogsFromUploadedFile(req.file.path);
    req.app.locals.uploadedLogs = logs;

    return sendResponse(
      res,
      true,
      "Dataset uploaded and normalized successfully",
      {
        fileName: req.file.originalname,
        totalLogs: logs.length,
        sampleLogs: logs.slice(0, 20),
        normalizedFormat: "Unified Log Object"
      },
      startTime
    );
  } catch (error) {
    return sendResponse(res, false, error.message, null, startTime);
  }
}

async function classifyLogs(req, res) {
  const startTime = Date.now();

  console.log("====================================");
  console.log("Classification API Triggered");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Body:", req.body);
  console.log("====================================");

  try {
    const useAI = req.body.useAI === true;

    let inputLogs = normalizeInputLogs(req.body.logs || req.body.log);

    if (inputLogs.length === 0) {
      const datasetLogs = req.app.locals.uploadedLogs || loadLogsFromFile();
      inputLogs = datasetLogs.map((log) => log.raw);
    }

    const pipelineContext = buildClassificationPipeline(inputLogs, {
      maxRepresentatives: useAI ? 7 : 20
    });

    // -----------------------------
    // AI MODE: Ollama only
    // -----------------------------
    if (useAI) {
      try {
        const aiResult = await classifyLogsWithAI(pipelineContext);

        return sendResponse(
          res,
          true,
          "Logs classified successfully using Ollama AI",
          
            {
  engineInfo: {
    mode: "Ollama AI",
    aiEnabled: true,
    llmUsed: true,
    model: "llama3.2"
  },
            architecture:
              "Preprocessing → Context Selection → LLM Reasoning",
            totalInputLogs: inputLogs.length,
            selectedContextLogs: pipelineContext.representatives.length,
            pipeline: pipelineContext.pipeline,
            aiAnalystSummary: aiResult.pipelineInsight,
            results: aiResult.results
          },
          startTime
        );
      }catch (aiError) {
  console.warn("Ollama failed. Falling back to local engine:", aiError.message);
}
    }

    // -----------------------------
    // LOCAL MODE: no AI at all
    // -----------------------------
    const allClassifiedLogs = inputLogs.map((log, index) =>
      enrichLog(log, index)
    );

    const categoryDistribution = {};
    const severityDistribution = {};

    allClassifiedLogs.forEach((log) => {
      categoryDistribution[log.category] =
        (categoryDistribution[log.category] || 0) + 1;

      severityDistribution[log.severity] =
        (severityDistribution[log.severity] || 0) + 1;
    });

    return sendResponse(
      res,
      true,
      "Logs classified successfully using local engine",
      {
  engineInfo: {
    mode: "Local Rule Engine",
    aiEnabled: false,
    llmUsed: false
  },
        architecture:
          "Parse → Enrich → Rule-Based Classification → Result",
        totalInputLogs: inputLogs.length,
        classifiedLogs: allClassifiedLogs.length,
        categoryDistribution,
        severityDistribution,
        pipeline: pipelineContext.pipeline,
        results: allClassifiedLogs
      },
      startTime
    );
  } catch (error) {
    return sendResponse(res, false, error.message, null, startTime);
  }
}

async function generateTimeline(req, res) {
  const startTime = Date.now();

  console.log("====================================");
  console.log("Timeline API Triggered");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Body:", req.body);
  console.log("====================================");

  try {
    const useAI = req.body.useAI === true;

    let logs;
    let dataSource;

    const inputLogs = normalizeInputLogs(req.body.logs);

    if (inputLogs.length > 0) {
      logs = parseLogsFromText(inputLogs.join("\n"));
      dataSource = "Request Body Logs";
    } else {
      logs = req.app.locals.uploadedLogs || loadLogsFromFile();
      dataSource = req.app.locals.uploadedLogs
        ? "Uploaded Dataset"
        : "Apache_2k.log Dataset";
    }

    const timelinePipeline = buildIncidentTimelinePipeline(logs, {
      maxEvents: useAI ? 7 : 15
    });

    // -----------------------------
    // AI MODE: Ollama only
    // -----------------------------
    if (useAI) {
      try {
        const aiTimeline = await generateTimelineWithAI(timelinePipeline);

if (!aiTimeline.timeline || !Array.isArray(aiTimeline.timeline) || aiTimeline.timeline.length === 0) {
  throw new Error("Ollama returned empty timeline");
}

return sendResponse(
          res,
          true,
          "Incident timeline generated successfully using Ollama AI",
          {
            dataSource,
            engineInfo: {
    mode: "Ollama AI",
    aiEnabled: true,
    llmUsed: true,
    model: "llama3.2"
},
            architecture:
              "Preprocessing → Incident Context Selection → LLM Timeline Reasoning",
            selectedContextEvents: timelinePipeline.timelineContext.length,
            timelineMeta: timelinePipeline.timelineMeta,
            incidentSummary: aiTimeline.incidentSummary,
            timeline: aiTimeline.timeline
          },
          startTime
        );
      } catch (aiError) {
  console.warn(
    "Ollama timeline failed. Falling back to local engine:",
    aiError.message
  );
}
    }

    // -----------------------------
    // LOCAL MODE: no AI at all
    // -----------------------------
    const localTimeline = {
      incidentSummary:
        timelinePipeline.primaryIncident?.summary ||
        "Timeline generated using local incident correlation, pattern detection, and operational event reconstruction.",

      timeline: timelinePipeline.timelineContext.map((event) => ({
        timestamp: event.timestamp,
        eventTitle: event.eventTitle,
        phaseType: event.phaseType,
        summary: event.summary,
        severity: event.severity,
        category: event.category,
        component: event.component,
        affectedComponents: event.affectedComponents,
        duration: event.duration,
        incidentScore: event.incidentScore,
        occurrences: event.eventCount,
        dominantErrorState: event.dominantErrorState,
        supportingLogReferences: event.supportingLogReferences,
        analystNote: event.analystNote,
        recommendedAction: event.recommendedAction
      }))
    };

    return sendResponse(
      res,
      true,
      "Incident timeline generated successfully using local engine",
      {
        engineInfo: {
          mode: useAI ? "Local Engine Fallback" : "Local Rule Engine",
          aiEnabled: useAI,
          llmUsed: false,
          fallbackUsed: useAI
        },
        architecture:
          "Pattern Detection → Incident Correlation → Timeline Reconstruction",
        timelineMeta: timelinePipeline.timelineMeta,
        patternSummary: timelinePipeline.patternSummary,
        primaryIncident: timelinePipeline.primaryIncident,
        detectedIncidents: timelinePipeline.detectedIncidents,
        incidentSummary: localTimeline.incidentSummary,
        timeline: localTimeline.timeline
      },
      startTime
    );
  } catch (error) {
    return sendResponse(res, false, error.message, null, startTime);
  }
}

async function rootCauseAnalysis(req, res) {
  const startTime = Date.now();

  console.log("====================================");
  console.log("Root Cause Analysis API Triggered");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Body:", req.body);
  console.log("====================================");

  try {
    const useAI = req.body.useAI === true;

    let logs;
    let dataSource;

    const inputLogs = normalizeInputLogs(req.body.logs);

    if (inputLogs.length > 0) {
      logs = parseLogsFromText(inputLogs.join("\n"));
      dataSource = "Request Body Logs";
    } else {
      logs = req.app.locals.uploadedLogs || loadLogsFromFile();
      dataSource = req.app.locals.uploadedLogs
        ? "Uploaded Dataset"
        : "Apache_2k.log Dataset";
    }

    const rcaPipeline = buildRootCausePipeline(logs);

    // -----------------------------
    // AI MODE: Ollama only
    // -----------------------------
    if (useAI) {
      try {
        const aiRca = await rootCauseWithAI(rcaPipeline);

        return sendResponse(
          res,
          true,
          "Root cause analysis completed successfully using Ollama AI",
          {
            dataSource,
            engineInfo: {
    mode: "Ollama AI",
    aiEnabled: true,
    llmUsed: true,
    model: "llama3.2"
},
            architecture:
              "Preprocessing → Incident Frame Selection → LLM RCA Reasoning",
            rootCause: aiRca.rootCause,
            supportingEvidence: aiRca.supportingEvidence,
            impact: aiRca.impact,
            recommendedAction: aiRca.recommendedAction,
            confidence: aiRca.confidence,
            severity: aiRca.severity,
            affectedComponent: aiRca.affectedComponent
          },
          startTime
        );
      } catch (aiError) {
  console.warn(
    "Ollama RCA failed. Falling back to local engine:",
    aiError.message
  );
}
    }

    // -----------------------------
    // LOCAL MODE: no AI at all
    // -----------------------------
    return sendResponse(
      res,
      true,
      "Root cause analysis completed successfully using local engine",
      {
        dataSource,
        engineInfo: {
  mode: useAI ? "Local Engine Fallback" : "Local Rule Engine",
  aiEnabled: useAI,
  llmUsed: false,
  fallbackUsed: useAI
},
        architecture:
          "Pattern Detection → Incident Correlation → Root Cause Inference",
        ...rcaPipeline
      },
      startTime
    );
  } catch (error) {
    return sendResponse(res, false, error.message, null, startTime);
  }
}

module.exports = {
  loadDataset,
  uploadDataset,
  classifyLogs,
  generateTimeline,
  rootCauseAnalysis
};