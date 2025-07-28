// conversationTracker.js
const THRESHOLD_MS = 1000 * 60 * 30; // 30 minutos
const lastSeen = new Map();

/**
 * @returns {boolean} true si es nueva conversación (>30 min)
 */
function isNewConversation(chatId) {
  const now = Date.now();
  const prev = lastSeen.get(chatId) || 0;
  lastSeen.set(chatId, now);
  return (now - prev) > THRESHOLD_MS;
}

module.exports = { isNewConversation };
