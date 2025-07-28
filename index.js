const express        = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs             = require('fs');
const path           = require('path');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode         = require('qrcode');
const xlsx           = require('xlsx');
const cors = require('cors')

const app  = express();
const PORT = process.env.PORT || 5000;
app.use(cors())

// --- Configuración de archivos y DB ---
const authDir         = path.join(__dirname, '.wwebjs_auth');
const sessionDir      = path.join(authDir, 'session', 'Default');
const CSV_PATH        = path.join(__dirname, 'stand_base_datos.csv');
const NUMERO_COBRANZA = '5491136454317@c.us';
const FORMATS_VALIDOS = [
  'application/pdf','image/jpeg','image/png','image/jpg',
  'image/gif','image/heic','image/heif'
];

// Carga inicial de la base de datos CSV
let dbRecords = [];
try {
  const wb   = xlsx.readFile(CSV_PATH);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  dbRecords   = rows.map(r => ({
    fila:   parseInt(r.fila, 10),
    puesto: parseInt(r.puesto, 10)
  }));
  console.log(`✅ DB cargada: ${dbRecords.length} registros`);
} catch (e) {
  console.error('❌ No se pudo leer base de datos:', e);
}

// Estado global de autenticación
let client;
let isReady = false;
let lastQR  = null;

// Función para (re)crear el cliente de WhatsApp
function initWhatsappClient() {
  if (client) {
    client.destroy();
    isReady = false;
    lastQR  = null;
  }
  client = new Client({ authStrategy: new LocalAuth() });

  client.on('qr', qr => {
    lastQR = qr;
    qrcodeTerminal.generate(qr, { small: true });
    console.log('🔑 QR generado, pendiente de escaneo');
  });

  client.on('ready', () => {
    isReady = true;
    lastQR  = null;
    console.log('🤖 Bot listo y autenticado!');
  });

  client.on('auth_failure', () => {
    isReady = false;
    console.warn('❌ Falló autenticación, generando nuevo QR');
  });

  client.on('disconnected', () => {
    isReady = false;
    console.log('⚠️ Cliente desconectado, reiniciando autenticación');
    initWhatsappClient();
  });

  client.initialize();
}

// Inicializa por primera vez
initWhatsappClient();

// --- Endpoint: mostrar estado y/o QR en HTML ---
/* app.get('/qr', async (req, res) => {
  res.set('Content-Type', 'text/html');
  if (isReady) {
    return res.send(`
      <div>
        <h1>Bot autenticado ✔️</h1>
        <p>Puedes usar el servicio por WhatsApp.</p>
        <p><a href="/logout">Desconectar sesión</a></p>
        <div/>
    `);
  }
  if (lastQR) {
    try {
      const qrDataUrl = await QRCode.toDataURL(lastQR);
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:2rem;">
          <h1>Escanea este QR con WhatsApp</h1>
          <img src="${qrDataUrl}" alt="QR Code" />
          <p>Una vez escaneado, recarga esta página.</p>
        </body></html>
      `);
    } catch (err) {
      console.error('❌ Error generando data URL del QR:', err);
      return res.status(500).send('<p>Error generando QR.</p>');
    }
  }
  return res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:2rem;">
      <h1>Generando QR…</h1>
      <p>Inténtalo de nuevo en unos segundos.</p>
    </body></html>
  `);
});
 */

app.get('/qr', async (req, res) => {
  // Siempre devolvemos JSON
  res.type('application/json');
  
  if (isReady) {
    return res.json({ authenticated: true });
  }
  
  if (lastQR) {
    // Opcionalmente, puedes preconvertirlo a DataURL en el backend:
    try {
      const dataUrl = await QRCode.toDataURL(lastQR);
      return res.json({
        authenticated: false,
        qr: dataUrl
      });
    } catch (err) {
      console.error('Error generando DataURL del QR:', err);
      return res.status(500).json({ error: 'Error generando QR' });
    }
  }

  // Aún no hay QR disponible
  return res.status(503).json({
    authenticated: false,
    qr: null,
    message: 'QR aún no generado, inténtalo en un momento'
  });
});


// --- Endpoint: logout y regenerar sesión ---
app.get('/logout', async (req, res) => {
  try {
    await client.logout();
    initWhatsappClient();
    return res.json({
      success: true,
      message: 'Sesión desconectada. Se está generando un nuevo QR.'
    });
  } catch (e) {
    console.error('❌ Error al desconectar:', e);
    return res.status(500).json({ error: 'No se pudo desconectar.' });
  }
});

// --- Lógica de conversación completa ---
let userData = {};

client.on('message', async msg => {
  const chatId = msg.from;
  const texto  = msg.body?.trim();
  if (!userData[chatId]) userData[chatId] = { step: 'inicio' };
  const u = userData[chatId];

  // Comando global para terminar
  if (texto?.toLowerCase() === 'salir') {
    delete userData[chatId];
    return msg.reply('✅ Gestión finalizada. ¡Hasta luego!');
  }

  // Paso 1: Saludo e inicio
  if (texto?.toLowerCase() === 'hola' && u.step === 'inicio') {
    u.step = 'nombre';
    await msg.reply('👋 ¡Hola! Soy *Gonza*, asistente virtual de *Urkupiña*.');
    return msg.reply('Para comenzar, escríbeme tu *nombre y apellido*.');
  }

  // Paso 2: Nombre
  if (u.step === 'nombre') {
    u.nombre = texto;
    u.step   = 'dni';
    return msg.reply('Gracias. Ahora ingresa tu *DNI* (solo números).');
  }

  // Paso 3: DNI
  if (u.step === 'dni') {
    if (!/^\d{6,9}$/.test(texto)) {
      return msg.reply('DNI inválido. Solo números, por favor.');
    }
    u.dni  = texto;
    u.step = 'ask_fila';
    return msg.reply('Perfecto. Ahora indícame tu *fila* (solo número).');
  }

  // Paso 4a: Solicitar fila
  if (u.step === 'ask_fila') {
    const filaNum = parseInt(texto, 10);
    if (isNaN(filaNum) || filaNum <= 0) {
      return msg.reply('Fila inválida. Escríbeme un número (ej. 4).');
    }
    u.fila = filaNum;
    u.step = 'ask_puesto';
    return msg.reply(`Fila *${filaNum}* registrada. ¿Ahora tu *puesto*? (solo número)`);
  }

  // Paso 4b: Solicitar puesto
  if (u.step === 'ask_puesto') {
    const puestoNum = parseInt(texto, 10);
    if (isNaN(puestoNum) || puestoNum <= 0) {
      return msg.reply('Puesto inválido. Escríbeme un número (ej. 8).');
    }
    u.puesto      = puestoNum;
    u.chequeadoDB = dbRecords.some(r => r.fila === u.fila && r.puesto === u.puesto);
    u.step        = 'menu';
    return msg.reply(
`¡Genial *${u.nombre}*!
- DNI: ${u.dni}
- Fila: ${u.fila}
- Puesto: ${u.puesto}

¿Qué deseas realizar?
1- Pagar expensas
2- Comprobantes de pagos realizados
3- Factura de pago

(Escribe *salir* para terminar)`
    );
  }

  // Paso 5: Menú principal
  if (u.step === 'menu') {
    if (texto === '1') {
      u.step = 'esperar_comprobante';
      return msg.reply('Elegiste *Pagar expensas*. Envía tu comprobante (PDF/imagen).');
    }
    if (texto === '2' || texto === '3') {
      const tipo = texto === '2'
        ? 'Comprobantes de pagos realizados'
        : 'Factura de pago';
      let summary =
`📌 Nueva solicitud de *${tipo}*:

*Nombre:* ${u.nombre}
*DNI:*    ${u.dni}
*Fila:*   ${u.fila}
*Puesto:* ${u.puesto}`;
      if (!u.chequeadoDB) {
        await msg.reply('⚠️ No encontramos tu fila/puesto en DB. Queda *NO CHEQUEADA*.');
        summary = '❌ [NO CHEQUEADO] ' + summary;
      }
      await client.sendMessage(NUMERO_COBRANZA, summary);
      u.step = 'otra_gestion';
      return msg.reply('✅ Tu solicitud ha sido remitida al área de cobranzas.\n¿Deseas realizar otra gestión? Responde *sí* o *no*.');
    }
    return msg.reply('Opción inválida. Escribe *1*, *2* o *3*, o *salir* para terminar.');
  }

  // Paso 6: Recepción de comprobante
  if (u.step === 'esperar_comprobante') {
    if (!msg.hasMedia) {
      return msg.reply('📎 Por favor, envía un comprobante (PDF/imagen).');
    }
    const media = await msg.downloadMedia();
    if (!FORMATS_VALIDOS.includes(media.mimetype)) {
      return msg.reply('⚠️ Solo acepto PDF o imágenes.');
    }
    // Guardar archivo
    const ext      = media.mimetype.split('/')[1];
    const filename = `comprobante_${chatId}_${Date.now()}.${ext}`;
    const dir      = path.join(__dirname, 'comprobantes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, filename), media.data, { encoding: 'base64' });

    let summary =
`📄 Nuevo comprobante de expensas:

*Nombre:* ${u.nombre}
*DNI:*    ${u.dni}
*Fila:*   ${u.fila}
*Puesto:* ${u.puesto}

✅ Comprobante adjunto.`;
    if (!u.chequeadoDB) {
      await msg.reply('⚠️ No encontramos tu fila/puesto en DB. Queda *NO CHEQUEADO*.');
      summary = '❌ [NO CHEQUEADO] ' + summary;
    }
    await client.sendMessage(NUMERO_COBRANZA, summary);
    await client.sendMessage(NUMERO_COBRANZA, new MessageMedia(media.mimetype, media.data, filename));
    u.step = 'otra_gestion';
    return msg.reply('✅ Comprobante enviado al área de cobranzas.\n¿Deseas realizar otra gestión? Responde *sí* o *no*.');
  }

  // Paso 7: Otra gestión
  if (u.step === 'otra_gestion') {
    const low = texto.toLowerCase();
    if (low === 'sí' || low === 'si') {
      u.step = 'menu';
      return msg.reply(
`Perfecto, ¿qué deseas hacer ahora?
1- Pagar expensas
2- Comprobantes de pagos realizados
3- Factura de pago

(Escribe *salir* para terminar)`
      );
    }
    if (low === 'no') {
      delete userData[chatId];
      return msg.reply('✅ Gestión finalizada. ¡Gracias y hasta luego!');
    }
    return msg.reply('Por favor responde *sí* o *no*.');
  }

  // Fallback
  if (u.step === 'inicio') {
    return msg.reply('📌 Para comenzar escribe *hola*.');
  }
  return msg.reply('🤖 No entendí tu mensaje. Escribe *hola* o *salir* para reiniciar.');
});

// --- Arrancar servidor HTTP ---
app.listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});
