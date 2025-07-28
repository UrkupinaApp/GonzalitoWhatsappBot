// index.js
const fs                    = require('fs');
const path                  = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal        = require('qrcode-terminal');
const express               = require('express');
const QRCode                = require('qrcode');
const xlsx                  = require('xlsx');

const { init, get, update, clear } = require('./conversationState');
const { sendWithTyping }           = require('./utils');
const { render }                   = require('./templateManager');
const { activeTemplate }           = require('./scheduleManager');

// ——— 0. Timestamp de arranque ———
const startTime = Math.floor(Date.now() / 1000);

// ——— Estado global ———
let qrForWeb = null;
let botReady = false;

// ——— 1. Inicializar client ———
const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', qr => {
  console.log('📲 Nuevo QR generado:');
  qrcodeTerminal.generate(qr, { small: true });
  QRCode.toDataURL(qr).then(url => { qrForWeb = url; });
});

client.on('ready', () => {
  botReady = true;
  console.log('🤖 Bot listo y autenticado.');
});

client.initialize();

// ——— 2. Express: QR UI + CRUD plantillas ———
const app = express();
app.use(express.json());
const CUSTOM_DIR = path.join(__dirname, 'templates', 'custom');

// Ruta QR/UI
app.get('/', (req, res) => {
  if (!botReady) {
    if (!qrForWeb) return res.send('<h1>⌛ Generando QR…</h1>');
    return res.send(`
      <h1>📲 Escanea este QR</h1>
      <img src="${qrForWeb}" alt="QR para WhatsApp" />
    `);
  }
  res.send('<h1>✅ Bot autenticado — listo para pruebas.</h1>');
});

// CRUD plantillas
app.get('/templates', (req, res) => {
  const files = fs.readdirSync(CUSTOM_DIR)
    .filter(f => f.endsWith('.hbs'))
    .map(f => f.replace(/\.hbs$/, ''));
  res.json(files);
});
app.get('/templates/:name', (req, res) => {
  const tplPath = path.join(CUSTOM_DIR, `${req.params.name}.hbs`);
  if (!fs.existsSync(tplPath)) return res.status(404).send('No existe');
  res.sendFile(tplPath);
});
app.post('/templates/:name', (req, res) => {
  const { content } = req.body;
  const tplPath = path.join(CUSTOM_DIR, `${req.params.name}.hbs`);
  fs.writeFileSync(tplPath, content, 'utf-8');
  res.send('✔ Guardado');
});
app.delete('/templates/:name', (req, res) => {
  const tplPath = path.join(CUSTOM_DIR, `${req.params.name}.hbs`);
  if (fs.existsSync(tplPath)) {
    fs.unlinkSync(tplPath);
    return res.send('✔ Eliminado');
  }
  res.status(404).send('No existe');
});

app.listen(3000, () => {
  console.log('🌐 API y QR UI en http://localhost:3000');
});

// ——— 3. Handler de mensajes ———
// reemplazá client.on('message', ...) por:
client.on('message_create', async msg => {
  const chatId = msg.from;
  const ts     = msg.timestamp;

  // 1) Ignorar mensajes previos al arranque
  if (ts < startTime) return;

  // 2) Ignorar si bot no listo o grupos
  if (!botReady || chatId.endsWith('@g.us')) return;

  // ahora va TODO tu flujo de pre-registro/fallback, idéntico al de 'message'
  let st = get(chatId);
  if (!st) {
    init(chatId);
    return sendWithTyping(client, chatId, '¡Hola! Por favor, escribí tu *nombre y apellido*.');
  }

  if (st.step === 'askName') {
    update(chatId, { step: 'askDNI', data: { nombre: msg.body.trim() } });
    return sendWithTyping(client, chatId, 'Gracias, ahora envía tu *DNI* (solo números).');
  }

  if (st.step === 'askDNI') {
    // ...igual que antes...
  }

  // paso final: ya registrado
  const tplName   = activeTemplate('fallback');
  const respuesta = render(tplName, { nombre: msg._data.notifyName || st.data.nombre });
  return sendWithTyping(client, chatId, respuesta);
});
