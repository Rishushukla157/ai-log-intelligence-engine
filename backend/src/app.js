require("dotenv").config();

const express = require("express");
const cors = require("cors");
const aiRoutes = require("./routes/ai.routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AI Log Intelligence Engine API is running"
  });
});

app.use("/api/ai", aiRoutes);

module.exports = app;