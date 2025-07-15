const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const PORT = process.env.PORT || 3000;

// Estado global del QR y autenticación
let qrData = null;
let isReady = false;

// Configuración del bot con flags para servidores
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    // Generamos una imagen del QR en base64 (útil para el frontend)
    qrcode.toDataURL(qr, (err, url) => {
        qrData = url;
        isReady = false;
        console.log('Nuevo QR generado, escanealo desde el frontend');
    });
});

client.on('ready', () => {
    isReady = true;
    qrData = null; // Ya no es necesario mostrar el QR
    console.log('Bot autenticado y listo!');
});

// Manejo de autenticación expirada/cierre de sesión
client.on('disconnected', () => {
    isReady = false;
    qrData = null;
    console.log('Bot desconectado, hay que escanear el QR de nuevo.');
});

client.initialize();

// Ruta para obtener el QR (GET /qr)
app.get('/qr', (req, res) => {
    if (qrData) {
        res.json({ qr: qrData });
    } else if (isReady) {
        res.status(200).json({ message: 'Bot autenticado' });
    } else {
        res.status(404).json({ message: 'No hay QR disponible aún' });
    }
});

// Ruta para saber si el bot está autenticado (GET /status)
app.get('/status', (req, res) => {
    res.json({ ready: isReady });
});

// Ruta para traer todos los chats activos (GET /chats)
app.get('/chats', async (req, res) => {
    if (!isReady) return res.status(401).json({ error: 'Bot no autenticado' });
    const chats = await client.getChats();
    // Podés filtrar info si no querés enviar TODO
    res.json(chats.map(chat => ({
        id: chat.id._serialized,
        name: chat.name || chat.formattedTitle || chat.id.user,
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount
    })));
});

// Ruta para traer mensajes de un chat (GET /messages/:chatId)
app.get('/messages/:chatId', async (req, res) => {
    if (!isReady) return res.status(401).json({ error: 'Bot no autenticado' });
    const chat = await client.getChatById(req.params.chatId);
    const messages = await chat.fetchMessages({ limit: 50 }); // Trae los últimos 50
    res.json(messages.map(m => ({
        from: m.from,
        to: m.to,
        body: m.body,
        timestamp: m.timestamp
    })));
});

app.listen(PORT, () => {
    console.log(`Bot escuchando en http://localhost:${PORT}`);
});
