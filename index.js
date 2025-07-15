const express = require('express');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const port = 4000;

let qrCodeString = null;
let authenticated = false;

const client = new Client();

client.on('qr', (qr) => {
    qrCodeString = qr;
    authenticated = false;
    console.log('Nuevo QR recibido');
});

client.on('ready', () => {
    authenticated = true;
    console.log('Bot autenticado y listo');
});

client.on('authenticated', () => {
    authenticated = true;
    console.log('Autenticado correctamente');
});

client.on('disconnected', () => {
    authenticated = false;
    qrCodeString = null;
    console.log('Desconectado');
});

client.initialize();

// Ruta para obtener el QR en base64 para mostrarlo en frontend fácilmente
app.get('/qr', async (req, res) => {
    if (qrCodeString && !authenticated) {
        const qrImage = await qrcode.toDataURL(qrCodeString);
        res.json({ qr: qrImage, raw: qrCodeString });
    } else if (authenticated) {
        res.json({ status: 'authenticated' });
    } else {
        res.json({ status: 'pending' });
    }
});

// Ruta para ver si está autenticado
app.get('/status', (req, res) => {
    res.json({ authenticated });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor Express escuchando en http://0.0.0.0:${port}`);
});
