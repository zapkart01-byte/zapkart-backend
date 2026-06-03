// Creates a structured log line for operational visibility.
function buildLogLine(level, message, meta = {}) {
  return JSON.stringify({
    level,
    message,
    meta,
    timestamp: new Date().toISOString(),
  })
}

// Writes informational logs to stdout as structured JSON.
function logInfo(message, meta = {}) {
  process.stdout.write(`${buildLogLine('info', message, meta)}\n`)
}

// Writes warning logs to stdout as structured JSON.
function logWarn(message, meta = {}) {
  process.stdout.write(`${buildLogLine('warn', message, meta)}\n`)
}

// Writes error logs to stderr as structured JSON.
function logError(message, meta = {}) {
  process.stderr.write(`${buildLogLine('error', message, meta)}\n`)
}

module.exports = {
  logInfo,
  logWarn,
  logError,
}
