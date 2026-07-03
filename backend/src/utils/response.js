function sendResponse(res, success, message, data, startTime) {
  return res.status(success ? 200 : 500).json({
    success,
    message,
    processingTimeMs: Date.now() - startTime,
    data
  });
}

module.exports = { sendResponse };