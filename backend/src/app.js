require("dotenv").config();

const express = require("express");
const cors = require("cors");
const aiRoutes = require("./routes/ai.routes");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "5mb" }));

// Request Logger
app.use((req, res, next) => {
  console.log("====================================");
  console.log(`${new Date().toISOString()}`);
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Body:", req.body);
  console.log("====================================");
  next();
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AI Log Intelligence Engine API is running"
  });
});

app.use("/api/ai", aiRoutes);

module.exports = app;