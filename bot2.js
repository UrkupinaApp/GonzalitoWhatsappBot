const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const qrcode = require('qrcode-terminal');

// 🧹 Eliminar sesión anterior para forzar QR
const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session', 'Default');
try {
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('✔ Sesión anterior eliminada');
    }
} catch (e) {
    console.error('❌ No se pudo eliminar la sesión:', e);
}

// 📄 Ruta al Excel
const EXCEL_PATH = path.join(__dirname, 'xlxs', 'inquilinos_modelo.xlsx');

// 📱 Cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth()
});

// 🧠 Memoria de usuarios
const userData = {};

client.on('qr', (qr) => {
    console.log('📲 Escaneá este código QR para iniciar sesión:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('🤖 Bot listo y conectado a WhatsApp.'));

client.on('message', async msg => {
    const chatId = msg.from;
    const texto = msg.body.trim();

    // Ignorar mensajes de grupos
    if (chatId.endsWith('@g.us')) return;

    if (!userData[chatId]) userData[chatId] = { step: 'inicio' };
    const usuario = userData[chatId];

    // Paso 1: Presentación
    if (texto.toLowerCase() === 'hola' && usuario.step === 'inicio') {
        await msg.reply('👋 Hola, soy *Gonza*, el asistente virtual de *Urkupiña*.\nVamos a registrar tus datos para continuar.');
        usuario.step = 'nombre';
        await msg.reply('Por favor, escribí tu *nombre y apellido*.');
        return;
    }

    // Paso 2: Nombre
    if (usuario.step === 'nombre') {
        usuario.nombre = texto;
        usuario.step = 'dni';
        await msg.reply('Gracias. Ahora escribí tu *DNI* (solo números).');
        return;
    }

    // Paso 3: DNI + validación contra Excel
    if (usuario.step === 'dni') {
        if (!/^\d{6,9}$/.test(texto)) {
            await msg.reply('⚠️ El DNI debe ser solo números. Intentalo de nuevo.');
            return;
        }
        usuario.dni = texto;

        // Verificar archivo Excel
        if (!fs.existsSync(EXCEL_PATH)) {
            await msg.reply('⚠️ No se encontró el archivo de inquilinos. Contactá con administración.');
            delete userData[chatId];
            return;
        }

        const workbook = xlsx.readFile(EXCEL_PATH);
        const hoja = workbook.Sheets[workbook.SheetNames[0]];
        const inquilinos = xlsx.utils.sheet_to_json(hoja);
        const match = inquilinos.find(row => String(row.DNI) === usuario.dni);

        if (!match) {
            await msg.reply('❌ No estás registrado como inquilino. Contactá con administración.');
            delete userData[chatId];
            return;
        }

        // Datos encontrados
        usuario.nombre = match.Nombre;
        usuario.fila = match.Fila;
        usuario.puesto = match.Puesto;
        usuario.step = 'confirmar';

        await msg.reply(
            `📋 Datos encontrados:\n\n*Nombre:* ${usuario.nombre}\n*DNI:* ${usuario.dni}\n*Fila:* ${usuario.fila}\n*Puesto:* ${usuario.puesto}\n\n¿Son correctos? Escribí *sí* o *no*.`
        );
        return;
    }

    // Confirmación
    if (usuario.step === 'confirmar') {
        if (['sí', 'si'].includes(texto.toLowerCase())) {
            usuario.confirmado = true;
            usuario.step = 'menu';
            await msg.reply(
                `✅ ¡Perfecto! Tus datos fueron confirmados.\n\n📌 ¿Qué querés hacer?\n\n1 - Pagar expensas\n2 - Consultar deuda\n3 - Ver comprobantes\n4 - Contactar mantenimiento`
            );
            return;
        } else if (texto.toLowerCase() === 'no') {
            delete userData[chatId];
            await msg.reply('🗑️ Tus datos fueron eliminados. Escribí "hola" para empezar de nuevo.');
            return;
        } else {
            await msg.reply('Por favor escribí *sí* o *no* para confirmar.');
            return;
        }
    }

    // Menú
    if (usuario.step === 'menu') {
        if (texto === '1') {
            await msg.reply('📤 Podés enviarme tu comprobante de pago en PDF o imagen.');
            // En pasos siguientes: guardar + enviar a administración
            return;
        }

        if (texto === '2') {
            await msg.reply('💰 Función de consulta de deuda próximamente disponible.');
            return;
        }

        if (texto === '3') {
            await msg.reply('📁 Pronto podrás ver el historial de comprobantes enviados.');
            return;
        }

        if (texto === '4') {
            await msg.reply('🔧 Por favor, describí brevemente el problema para contactar a mantenimiento.');
            usuario.step = 'mantenimiento_descripcion';
            return;
        }

        await msg.reply('📌 Elegí una opción del menú escribiendo 1, 2, 3 o 4.');
        return;
    }

    // Descripción para mantenimiento
    if (usuario.step === 'mantenimiento_descripcion') {
        usuario.step = 'menu';
        await msg.reply('📝 Tu reporte fue registrado:\n\n' + texto + '\n\nUn encargado lo revisará pronto.');
        // En pasos siguientes: guardar reporte en Excel
        return;
    }

    // Fallback
    await msg.reply('🤖 No entendí tu mensaje. Escribí *hola* para comenzar o *menu* si ya registraste tus datos.');
});

client.initialize();
