import { useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/ai";
console.log("API URL:", API_BASE_URL);

function App() {
  const [logs, setLogs] = useState("");
  const [response, setResponse] = useState(null);
  const [activeFeature, setActiveFeature] = useState("classification");
  const [loading, setLoading] = useState(false);
  const [useAI, setUseAI] = useState(false);

  const sampleLogs = `[Sun Dec 04 04:47:44 2005] [notice] workerEnv.init() ok /etc/httpd/conf/workers2.properties
[Sun Dec 04 04:47:44 2005] [error] mod_jk child workerEnv in error state 6
[Sun Dec 04 04:51:08 2005] [notice] jk2_init() Found child 6725 in scoreboard slot 10
[Sun Dec 04 04:51:18 2005] [error] mod_jk child workerEnv in error state 6
[Sun Dec 04 04:55:01 2005] [warn] Backend communication retry detected
[Sun Dec 04 04:56:22 2005] [error] Tomcat backend connection timeout
[Sun Dec 04 04:57:30 2005] [error] client denied by server configuration`;

  const getPayload = () => {
    if (!logs.trim()) return { useAI };

    return {
      useAI,
      logs: logs.split("\n").filter((line) => line.trim() !== "")
    };
  };

      
  const callApi = async (endpoint, featureName) => {
    setLoading(true);
    setResponse(null);
    setActiveFeature(featureName);

    try {
      const res = await axios.post(`${API_BASE_URL}/${endpoint}`, getPayload());
      setResponse(res.data);
    } catch (error) {
      setResponse({
        success: false,
        message: error.response?.data?.message || error.message,
        data: null
      });
    } finally {
      setLoading(false);
    }
  };


  const runSampleLogs = async () => {
  const sampleLogLines = sampleLogs
    .split("\n")
    .filter((line) => line.trim() !== "");

  let endpoint = "log-classification";
  let featureName = "classification";

  if (activeFeature === "timeline") {
    endpoint = "incident-timeline";
    featureName = "timeline";
  }

  if (activeFeature === "rca") {
    endpoint = "root-cause-analysis";
    featureName = "rca";
  }

  setLogs(sampleLogs);
  setLoading(true);
  setResponse(null);
  setActiveFeature(featureName);

  try {
    const res = await axios.post(`${API_BASE_URL}/${endpoint}`, {
      useAI,
      logs: sampleLogLines
    });

    setResponse(res.data);
  } catch (error) {
    setResponse({
      success: false,
      message: error.response?.data?.message || error.message,
      data: null
    });
  } finally {
    setLoading(false);
  }
};


  const loadDataset = async () => {
    setLoading(true);
    setResponse(null);
    setActiveFeature("dataset");

    try {
      const res = await axios.get(`${API_BASE_URL}/load-dataset`);
      setResponse(res.data);
    } catch (error) {
      setResponse({
        success: false,
        message: error.response?.data?.message || error.message,
        data: null
      });
    } finally {
      setLoading(false);
    }
  };

  const getSeverityClass = (severity) => {
    const value = String(severity || "").toLowerCase();

    if (value === "critical") return "severity critical";
    if (value === "high") return "severity high";
    if (value === "medium") return "severity medium";
    if (value === "low") return "severity low";

    return "severity unknown";
  };

  const AnalystSummary = () => {
    if (!response?.data?.aiAnalystSummary) return null;

    return (
      <div className="ai-summary">
        <h3>AI Analyst Summary</h3>
        <p>{response.data.aiAnalystSummary}</p>
      </div>
    );
  };

  const renderClassification = () => {
    const data = response?.data?.results || [];
    const visibleLogs = data.slice(0, 20);

    if (!Array.isArray(data)) return <JsonViewer data={response} />;

    return (
      <>
        <AnalystSummary />

        <div className="stats">
          <div className="stat-card">
            <h3>{response.data.pipeline?.totalInputLogs}</h3>
            <p>Total Input Logs</p>
          </div>

          <div className="stat-card">
            <h3>{response.data.pipeline?.uniquePatterns}</h3>
            <p>Unique Patterns</p>
          </div>

          <div className="stat-card">
            <h3>{response.data.pipeline?.clusters}</h3>
            <p>Clusters</p>
          </div>

          <div className="stat-card">
            <h3>{response.data.pipeline?.representativesSelected}</h3>
            <p>AI Context Logs</p>
          </div>
        </div>

        {response.data.aiMode && (
          <div className="warning-box">
            Mode: {response.data.aiMode}
          </div>
        )}

        <div className="result-grid">
          {visibleLogs.map((item, index) => (
            <div className="result-card" key={index}>
              <div className="result-header">
                <span className="badge">{item.category}</span>
                <span className="confidence">{item.confidence}%</span>
              </div>

              <div className="meta-row">
                <span className={getSeverityClass(item.severity)}>
                  {item.severity || "Unknown"}
                </span>
                <span className="component">
                  {item.component || "Unknown Component"}
                </span>
              </div>

              {item.rawLog && (
                <p className="log-text">
                  <strong>Log:</strong> {item.rawLog}
                </p>
              )}

              {item.timestamp && (
                <p className="explanation">
                  <strong>Timestamp:</strong> {item.timestamp}
                </p>
              )}

              {item.level && (
                <p className="explanation">
                  <strong>Level:</strong> {item.level}
                </p>
              )}

              <p className="explanation">
                <strong>AI Explanation:</strong> {item.explanation}
              </p>

              <p className="explanation">
                <strong>Recommended Action:</strong> {item.recommendedAction}
              </p>

              <div className="tag-row">
                {item.tags?.map((tag, tagIndex) => (
                  <span className="tag" key={tagIndex}>
                    {tag}
                  </span>
                ))}
              </div>

              {item.mode && <p className="mode-label">{item.mode}</p>}
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderTimeline = () => {
    const data = response?.data;
    const timeline = data?.timeline || [];

    if (!Array.isArray(timeline)) return <JsonViewer data={response} />;

    return (
      <div>
        <AnalystSummary />

        <div className="stats">
          <div className="stat-card">
            <h3>{data.timelineMeta?.totalLogsAnalyzed || 0}</h3>
            <p>Total Logs Analyzed</p>
          </div>

          <div className="stat-card">
            <h3>{data.timelineMeta?.uniquePatternTypes || 0}</h3>
            <p>Pattern Types</p>
          </div>

          <div className="stat-card">
            <h3>{data.timelineMeta?.correlatedIncidents || 0}</h3>
            <p>Correlated Incidents</p>
          </div>

          <div className="stat-card">
            <h3>{data.timelineMeta?.selectedTimelineEvents || 0}</h3>
            <p>Timeline Events</p>
          </div>
        </div>

        {data.aiMode && (
          <div className="warning-box">
            Mode: {data.aiMode} | AI Enhancement: {data.aiEnhancementStatus}
          </div>
        )}

        {data.primaryIncident && (
          <div className="rca-card">
            <div className="rca-section">
              <h3>Primary Incident</h3>
              <p>{data.primaryIncident.title}</p>
            </div>

            <div className="stats">
              <div className="stat-card">
                <h3>{data.primaryIncident.occurrences}</h3>
                <p>Occurrences</p>
              </div>

              <div className="stat-card">
                <h3>{data.primaryIncident.duration}</h3>
                <p>Duration</p>
              </div>

              <div className="stat-card">
                <h3>{data.primaryIncident.dominantErrorState || "N/A"}</h3>
                <p>Dominant Error State</p>
              </div>

              <div className="stat-card">
                <h3>{data.primaryIncident.confidence}%</h3>
                <p>Confidence</p>
              </div>
            </div>

            <p>{data.primaryIncident.summary}</p>
            <p>
              <strong>Impact:</strong> {data.primaryIncident.impact}
            </p>
            <p>
              <strong>Recommended Action:</strong>{" "}
              {data.primaryIncident.recommendedAction}
            </p>
          </div>
        )}

        <div className="timeline">
          {timeline.map((event, index) => (
            <div className="timeline-item" key={index}>
              <div className="timeline-dot"></div>

              <div className="timeline-content">
                <span className="timeline-time">{event.timestamp}</span>

                <h3>{event.eventTitle}</h3>

                <p className="timeline-summary">{event.summary}</p>

                <div className="meta-row">
                  <span className={getSeverityClass(event.severity)}>
                    {event.severity}
                  </span>

                  <span className="component">{event.component}</span>

                  <span className="tag">{event.category}</span>

                  {event.duration && (
                    <span className="tag">Duration: {event.duration}</span>
                  )}

                  {event.occurrences && (
                    <span className="tag">Occurrences: {event.occurrences}</span>
                  )}
                </div>

                <small>
                  <strong>Supporting Logs:</strong>{" "}
                  {Array.isArray(event.supportingLogReferences)
                    ? event.supportingLogReferences.slice(0, 10).join(", ")
                    : "N/A"}

                  {event.supportingLogReferences?.length > 10 &&
                    ` +${event.supportingLogReferences.length - 10} more`}
                </small>

                <details className="details-box">
                  <summary>View analyst details</summary>

                  {event.dominantErrorState && (
                    <p>
                      <strong>Dominant Error State:</strong>{" "}
                      {event.dominantErrorState}
                    </p>
                  )}

                  <p>
                    <strong>Analyst Note:</strong> {event.analystNote}
                  </p>

                  <p>
                    <strong>Recommended Action:</strong>{" "}
                    {event.recommendedAction}
                  </p>
                </details>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRCA = () => {
    const data = response?.data;

    if (!data || Array.isArray(data)) return <JsonViewer data={response} />;

    return (
      <div className="rca-card">
        <AnalystSummary />

        {data.aiMode && (
          <div className="warning-box">
            Mode: {data.aiMode} | AI Enhancement: {data.aiEnhancementStatus}
          </div>
        )}

        <div className="executive-summary">
          <h3>Incident Executive Summary</h3>
          <p>
            Analysis detected a primary incident related to{" "}
            <strong>{data.affectedComponent}</strong> with{" "}
            <strong>{data.confidence}% confidence</strong>.
          </p>
          <p>{data.rootCause}</p>
        </div>

        <div className="stats">
          <div className="stat-card">
            <h3>{data.confidence}%</h3>
            <p>Confidence</p>
          </div>

          <div className="stat-card">
            <h3>{data.severity || "N/A"}</h3>
            <p>Severity</p>
          </div>

          <div className="stat-card">
            <h3>{data.affectedComponent || "N/A"}</h3>
            <p>Affected Component</p>
          </div>

          <div className="stat-card">
            <h3>{data.primaryIncident?.occurrences || "N/A"}</h3>
            <p>Occurrences</p>
          </div>
        </div>

        <div className="rca-section">
          <h3>Root Cause</h3>
          <p>{data.rootCause}</p>
        </div>

        <div className="rca-section">
          <h3>Cause-Effect Flow</h3>
          <div className="flow-chain">
            {data.causeEffectChain?.map((step, index) => (
              <div className="flow-step" key={index}>
                <div className="flow-number">{index + 1}</div>
                <p>{step}</p>
                {index < data.causeEffectChain.length - 1 && (
                  <div className="flow-arrow">↓</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rca-section">
          <h3>Evidence Checklist</h3>
          <div className="evidence-list">
            {data.supportingEvidence?.map((evidence, index) => (
              <div className="evidence-item" key={index}>
                <span>✓</span>
                <p>{evidence}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rca-section">
          <h3>Impact</h3>
          <p>{data.impact}</p>
        </div>

        <div className="rca-section">
          <h3>Recommended Action</h3>
          <p className="recommendation-text">{data.recommendedAction}</p>
        </div>
      </div>
    );
  };

  const renderDataset = () => {
    const data = response?.data;

    if (!data) return <JsonViewer data={response} />;

    return (
      <div>
        <div className="stats">
          <div className="stat-card">
            <h3>{data.totalLogs}</h3>
            <p>Total Logs Loaded</p>
          </div>
          <div className="stat-card">
            <h3>{data.sampleLogs?.length || 0}</h3>
            <p>Sample Logs Displayed</p>
          </div>
        </div>

        <div className="result-grid">
          {data.sampleLogs?.map((log) => (
            <div className="result-card" key={log.id}>
              <div className="result-header">
                <span className="badge">
                  {log.category || log.ruleCategory}
                </span>
                <span className="confidence">{log.level}</span>
              </div>

              <div className="meta-row">
                <span className={getSeverityClass(log.severity)}>
                  {log.severity || "Unknown"}
                </span>
                <span className="component">{log.component || "Apache"}</span>
              </div>

              <p className="log-text">{log.raw}</p>
              <p className="explanation">{log.timestamp}</p>

              <div className="tag-row">
                {log.tags?.map((tag, tagIndex) => (
                  <span className="tag" key={tagIndex}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderResults = () => {
    if (!response) return <p className="empty">Run an API to view AI results.</p>;
    if (!response.success) return <JsonViewer data={response} />;

    if (activeFeature === "classification") return renderClassification();
    if (activeFeature === "timeline") return renderTimeline();
    if (activeFeature === "rca") return renderRCA();
    if (activeFeature === "dataset") return renderDataset();

    return <JsonViewer data={response} />;
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>AI SIEM</h2>
        <p>Log Intelligence Engine</p>

        <button onClick={loadDataset}>Load Dataset</button>
        <button onClick={() => callApi("log-classification", "classification")}>
          Classify Logs
        </button>
        <button onClick={() => callApi("incident-timeline", "timeline")}>
          Generate Timeline
        </button>
        <button onClick={() => callApi("root-cause-analysis", "rca")}>
          Root Cause Analysis
        </button>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <h1>AI Log Intelligence Engine</h1>
            <p>
              Hybrid AI-powered Apache log analysis using rule-based enrichment,
              context selection, classification, timeline generation, and root
              cause analysis.
            </p>
          </div>

          <div className="status-box">
            <span>Status</span>
            <strong>{loading ? "Processing..." : "Ready"}</strong>
          </div>
        </header>

        <section className="panel">
          <div className="panel-header">
            <h2>Apache Log Input</h2>

            <div className="header-actions">
              <label className="ai-toggle">
                <input
                  type="checkbox"
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                />
                Use Ollama AI
              </label>

              <button className="secondary" onClick={runSampleLogs}>
  Use Sample Logs
</button>
            </div>
          </div>

          <textarea
            value={logs}
            onChange={(e) => setLogs(e.target.value)}
            placeholder="Paste Apache logs here. Leave empty for Timeline and RCA to use the full dataset."
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>AI Output</h2>
            {response?.processingTimeMs && (
              <span className="time">{response.processingTimeMs} ms</span>
            )}
          </div>

          {loading ? (
            <div className="loader">Analyzing logs...</div>
          ) : (
            renderResults()
          )}
        </section>
      </main>
    </div>
  );
}

function JsonViewer({ data }) {
  return <pre className="json">{JSON.stringify(data, null, 2)}</pre>;
}

export default App;