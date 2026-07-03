const fs = require("fs");
const path = require("path");

let cachedLogs = null;

function extractTimestamp(line) {
  const match = line.match(/\[(.*?)\]/);
  return match ? match[1] : null;
}

function extractLevel(line) {
  const match = line.match(/\] \[(.*?)\]/);
  if (match) return match[1].toLowerCase();

  const text = line.toLowerCase();

  if (text.includes("error")) return "error";
  if (text.includes("warn")) return "warn";
  if (text.includes("notice")) return "notice";
  if (text.includes("debug")) return "debug";

  return "unknown";
}

function detectComponent(line) {
  const text = line.toLowerCase();

  if (text.includes("mod_jk")) return "mod_jk";
  if (text.includes("worker")) return "Apache Worker";
  if (text.includes("jk2_init")) return "JK Connector";
  if (text.includes("tomcat")) return "Tomcat Backend";
  if (text.includes("proxy")) return "Proxy Module";
  if (text.includes("ssl")) return "SSL Module";
  if (text.includes("auth")) return "Authentication Module";
  if (text.includes("config") || text.includes("conf")) return "Configuration";

  return "Apache Core";
}

function detectSeverity(line) {
  const text = line.toLowerCase();

  if (
    text.includes("fatal") ||
    text.includes("critical") ||
    text.includes("crash") ||
    text.includes("unavailable")
  ) {
    return "Critical";
  }

  if (
    text.includes("error") ||
    text.includes("failed") ||
    text.includes("failure") ||
    text.includes("timeout") ||
    text.includes("error state")
  ) {
    return "High";
  }

  if (
    text.includes("warn") ||
    text.includes("retry") ||
    text.includes("deprecated")
  ) {
    return "Medium";
  }

  if (
    text.includes("notice") ||
    text.includes("init") ||
    text.includes("started") ||
    text.includes("ok")
  ) {
    return "Low";
  }

  return "Unknown";
}

function detectTags(line) {
  const text = line.toLowerCase();
  const tags = [];

  if (text.includes("mod_jk")) tags.push("mod_jk");
  if (text.includes("worker")) tags.push("worker");
  if (text.includes("error state")) tags.push("error-state");
  if (text.includes("timeout")) tags.push("timeout");
  if (text.includes("retry")) tags.push("retry");
  if (text.includes("backend")) tags.push("backend");
  if (text.includes("tomcat")) tags.push("tomcat");
  if (text.includes("config") || text.includes("conf")) tags.push("configuration");
  if (text.includes("denied") || text.includes("unauthorized")) tags.push("security");
  if (text.includes("init")) tags.push("initialization");

  return tags;
}

function ruleBasedCategory(line) {
  const text = line.toLowerCase();

  if (
    text.includes("denied") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("permission")
  ) {
    return "Security";
  }

  if (
    text.includes("timeout") ||
    text.includes("slow") ||
    text.includes("latency")
  ) {
    return "Performance";
  }

  if (
    text.includes("tomcat") ||
    text.includes("backend") ||
    text.includes("proxy") ||
    text.includes("connection refused")
  ) {
    return "Backend Communication";
  }


  if (
  text.includes("workerenv in error state") ||
  text.includes("mod_jk child workerenv in error state") ||
  text.includes("error state")
) {
  return "Worker Failure";
}



  if (
  text.includes("workerenv.init() ok") ||
  text.includes("jk2_init() found child") ||
  text.includes("found child") ||
  text.includes("scoreboard slot")
) {
  return "Worker Initialization";
}

  if (
    text.includes("configured") ||
    text.includes("workers2.properties") ||
    text.includes("httpd.conf") ||
    text.includes("config")
  ) {
    return "Configuration";
  }

  if (
    text.includes("shutdown") ||
    text.includes("shutting down") ||
    text.includes("stopped")
  ) {
    return "Shutdown";
  }

  if (
    text.includes("started") ||
    text.includes("resuming normal operations") ||
    text.includes("init() ok")
  ) {
    return "Startup";
  }

  if (
    text.includes("error") ||
    text.includes("failed") ||
    text.includes("failure") ||
    text.includes("error state")
  ) {
    return "Error";
  }

  if (
    text.includes("warn") ||
    text.includes("warning")
  ) {
    return "Warning";
  }

  return "Unknown";
}

function generateRuleExplanation(line, category, severity, component) {
  return `The log was categorized as ${category} because it contains signals related to ${component}. Severity is marked as ${severity} based on the operational keywords present in the log.`;

  if (category === "Worker Failure") {
  return `The log was categorized as Worker Failure because mod_jk workerEnv entered an error state during operation. Severity is ${severity} because the log contains an Apache error-state signal.`;
}
}

function generateRuleRecommendation(category, severity, component) {
  if (category === "Worker Initialization") {
    return "Check Apache worker configuration, workers2.properties, and mod_jk child worker status.";
  }

  if (category === "Backend Communication") {
    return "Verify backend service availability, network connectivity, and proxy/Tomcat configuration.";
  }

  if (category === "Security") {
    return "Review access control rules, authentication logs, and suspicious request patterns.";
  }

  if (category === "Performance") {
    return "Check request latency, timeout settings, backend response time, and server resource usage.";
  }

  if (category === "Configuration") {
    return "Validate Apache configuration files and reload the server after correcting configuration issues.";
  }
  if (category === "Worker Initialization") {
  return "Verify Apache worker initialization behavior, JK connector status, scoreboard activity, and Apache-Tomcat connector configuration used by this deployment.";
}

  if (category === "Shutdown") {
    return "Check whether the shutdown was planned or caused by service failure.";
  }

  if (category === "Startup") {
    return "Confirm that Apache services and required modules started successfully.";
  }

  if (severity === "High" || severity === "Critical") {
    return `Investigate ${component} immediately and check nearby error logs for related failures.`;
  }

  return "Monitor this log pattern and correlate it with nearby events if repeated.";
}

function calculateRuleConfidence(category, severity, tags) {
  let confidence = 60;

  if (category !== "Unknown") confidence += 15;
  if (severity === "Critical" || severity === "High") confidence += 10;
  if (tags.length >= 2) confidence += 10;
  if (tags.length >= 4) confidence += 5;

  return Math.min(confidence, 95);
}

function enrichLog(line, index = 0) {
  const category = ruleBasedCategory(line);
  const severity = detectSeverity(line);
  const component = detectComponent(line);
  const tags = detectTags(line);
  const confidence = calculateRuleConfidence(category, severity, tags);

  return {
    id: index + 1,
    raw: line.trim(),
    timestamp: extractTimestamp(line),
    level: extractLevel(line),
    category,
    severity,
    component,
    confidence,
    tags,
    explanation: generateRuleExplanation(line, category, severity, component),
    recommendedAction: generateRuleRecommendation(category, severity, component)
  };
}

function parseLogsFromText(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line, index) => enrichLog(line, index));
}

function loadLogsFromFile() {
  if (cachedLogs) return cachedLogs;

  const filePath = path.join(__dirname, "../../data/Apache_2k.log");

  if (!fs.existsSync(filePath)) {
    throw new Error("Apache_2k.log file not found inside backend/data folder");
  }

  const rawText = fs.readFileSync(filePath, "utf-8");
  cachedLogs = parseLogsFromText(rawText);

  return cachedLogs;
}

module.exports = {
  parseLogsFromText,
  loadLogsFromFile,
  ruleBasedCategory,
  enrichLog
};