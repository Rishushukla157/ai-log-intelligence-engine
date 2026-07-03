const express = require("express");
const upload = require("../middlewares/upload.middleware");

const {
  loadDataset,
  uploadDataset,
  classifyLogs,
  generateTimeline,
  rootCauseAnalysis
} = require("../controllers/ai.controller");

const router = express.Router();

router.get("/load-dataset", loadDataset);

router.post("/upload-dataset", upload.single("file"), uploadDataset);

router.post("/log-classification", classifyLogs);

router.post("/incident-timeline", generateTimeline);

router.post("/root-cause-analysis", rootCauseAnalysis);

module.exports = router;