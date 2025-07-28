// conversationState.js
const states = new Map();

/**
 * Inicializa el estado de un chat nuevo.
 */
function init(chatId) {
  states.set(chatId, { step: 'askName', data: {} });
}

/**
 * Obtiene el estado completo de un chat.
 */
function get(chatId) {
  return states.get(chatId);
}

/**
 * Avanza el paso y opcionalmente añade datos.
 */
function update(chatId, { step, data }) {
  const st = states.get(chatId) || { step: null, data: {} };
  if (step) st.step = step;
  if (data) st.data = { ...st.data, ...data };
  states.set(chatId, st);
}

/**
 * Limpia el estado cuando termina o falla el registro.
 */
function clear(chatId) {
  states.delete(chatId);
}

module.exports = { init, get, update, clear };
