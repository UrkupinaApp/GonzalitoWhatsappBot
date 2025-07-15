const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

// Cambia por el número de cobranzas real (en formato WhatsApp)
const NUMERO_COBRANZA = '5492915093499@c.us';

let userData = {};

const FORMATS_VALIDOS = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/gif',
    'image/heic',
    'image/heif'
];

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('Bot listo!'));

client.on('message', async msg => {
    const chatId = msg.from;
    const texto = msg.body.trim().toLowerCase();

    // Guardar datos del usuario (nombre, DNI, fila, puesto)
    if (texto.match(/^[a-záéíóúüñ\s]+,\s*\d+,\s*fila\s*\d+,\s*puesto\s*\d+$/i)) {
        userData[chatId] = { datos: texto };
        await msg.reply(
            '¿Esta información es correcta?\n👍 Escribe "si" para confirmar o "no" para corregir.\n\n' + texto
        );
        return;
    }

    if (texto === 'si' && userData[chatId] && userData[chatId].datos) {
        userData[chatId].confirmado = true;
        await msg.reply('Datos confirmados. Ahora podés enviar el comprobante de pago (PDF o imagen).');
        return;
    }

    if (texto === 'no' && userData[chatId]) {
        delete userData[chatId];
        await msg.reply('Ok, volvé a ingresar tus datos: Nombre, DNI, Fila X, Puesto Y');
        return;
    }

    // Menú
    if (texto === 'hola' || texto === 'menu') {
        await msg.reply(
            `Hola soy Gonza! Tu asistente de Urkupiña.\n¿Qué querés hacer?\n\n1- pagar expensas\n2- consultar deuda\n3- comprobantes de pagos realizados`
        );
        return;
    }
    if (texto === '1') {
        await msg.reply('Elegiste *Pagar expensa*.\nIndicanos tus datos: Nombre, DNI, Fila X, Puesto Y');
        return;
    }
    if (texto === '2') {
        await msg.reply('Para consultar deuda, por favor indicá tu DNI.');
        return;
    }
    if (texto === '3') {
        await msg.reply('Si ya enviaste comprobantes en PDF o imagen, nuestro equipo los revisará y se contactará contigo si hay algún problema.');
        return;
    }

    // RECEPCIÓN Y REENVÍO DE PDF o IMAGEN
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();

        // Validar tipo de archivo
        if (FORMATS_VALIDOS.includes(media.mimetype)) {
            // Guardar localmente (opcional)
            const ext = media.mimetype.split('/')[1];
            const filename = `comprobante_${chatId}_${Date.now()}.${ext}`;
            const dir = path.join(__dirname, 'comprobantes');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            const filePath = path.join(dir, filename);
            fs.writeFileSync(filePath, media.data, { encoding: 'base64' });

            // Reenvío al cobrador SOLO si datos confirmados
            if (userData[chatId] && userData[chatId].confirmado) {
                const datos = userData[chatId].datos;
                await client.sendMessage(NUMERO_COBRANZA,
                    `📄 Nuevo comprobante recibido:\n\nDatos del vecino:\n${datos}\n\nEl comprobante está adjunto.`
                );
                const mediaMessage = new MessageMedia(media.mimetype, media.data, filename);
                await client.sendMessage(NUMERO_COBRANZA, mediaMessage);
                await msg.reply('✅ ¡Comprobante enviado al área de cobranzas!');
                delete userData[chatId];
            } else {
                await msg.reply('Por favor, primero enviá tus datos (Nombre, DNI, Fila X, Puesto Y) y confirmalos con "si".');
            }
            return;
        } else {
            await msg.reply('Por favor, envía el comprobante en PDF o imagen (jpg, png, gif, heic).');
            return;
        }
    }
});

client.initialize();


