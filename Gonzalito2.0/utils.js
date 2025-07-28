// utils.js
module.exports.sendWithTyping = async (client, chatId, text) => {
  // 1) Opcional: marcar como leído
  try {
    await client.sendSeen(chatId);
  } catch (e) { /* ignora si falla */ }

  // 2) Espera “pensando”
  const delayMs = text.length * 40 + Math.random() * 600;
  await new Promise(res => setTimeout(res, delayMs));

  // 3) Envía el mensaje
  return client.sendMessage(chatId, text);
};
