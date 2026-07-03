function normalizeInputLogs(inputLogs) {
  if (!inputLogs) return [];

  if (typeof inputLogs === "string") {
    return inputLogs.split("\n").filter(Boolean);
  }

  if (Array.isArray(inputLogs)) {
    return inputLogs.filter(Boolean);
  }

  return [];
}

function selectRelevantLogs(logs, maxLogs = 40) {
  const priorityKeywords = [
    "error",
    "failed",
    "failure",
    "warn",
    "timeout",
    "denied",
    "shutdown",
    "restart",
    "backend",
    "proxy",
    "tomcat",
    "connection"
  ];

  const scoredLogs = logs.map((log) => {
    const text = typeof log === "string" ? log.toLowerCase() : log.raw.toLowerCase();

    let score = 0;

    priorityKeywords.forEach((keyword) => {
      if (text.includes(keyword)) score += 2;
    });

    return {
      log,
      score
    };
  });

  return scoredLogs
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLogs)
    .map((item) => item.log);
}

function groupLogsForTimeline(logs, maxGroups = 20) {
  const groups = {};

  logs.forEach((log) => {
    const category = log.ruleCategory || "Unknown";

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(log);
  });

  return Object.entries(groups)
    .slice(0, maxGroups)
    .map(([category, items]) => ({
      category,
      count: items.length,
      logs: items.slice(0, 5)
    }));
}

module.exports = {
  normalizeInputLogs,
  selectRelevantLogs,
  groupLogsForTimeline
};