let io = null

// Stores the Socket.io instance for cross-module usage.
function setIo(socketServer) {
  io = socketServer
}

// Returns the Socket.io instance for broadcasting events.
function getIo() {
  return io
}

module.exports = {
  setIo,
  getIo,
}
