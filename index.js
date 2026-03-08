const { 
    default: makeWASocket, useMultiFileAuthState, DisconnectReason, 
    fetchLatestBaileysVersion, downloadContentFromMessage 
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require('fs');
const { execSync } = require('child_process'); 
const yts = require('yt-search');

let warnings = {};
let mutedUsers = {};

async function startRussiaBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_russia_pro');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ["Russia V7 Force", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return; // البوت هيرد عليك حتى لو الرسالة منك

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
        const isGroup = from.endsWith('@g.us');
        const pushName = msg.pushName || "يا بطل";

        // 🛡️ [فلتر السب والتحذيرات الإجباري]
        const badWords = ["كسمك", "عرص", "خول", "زاني", "زبي", "متناك", "خخخ", "شرموط", "جحبه", "طيز"];
        if (isGroup && (badWords.some(w => text.includes(w)) || text.includes("http"))) {
            await sock.sendMessage(from, { delete: msg.key });
            if (!warnings[sender]) warnings[sender] = 0;
            warnings[sender]++;
            
            if (warnings[sender] < 3) {
                await sock.sendMessage(from, { text: `⚠️ يا @${sender.split('@')[0]} اعدل لسانك! تحذير رقم (${warnings[sender]}/3).. المرة الجاية كتم!`, mentions: [sender] });
            } else {
                const muteTime = 10 * 60 * 1000;
                if (!mutedUsers[from]) mutedUsers[from] = {};
                mutedUsers[from][sender] = Date.now() + muteTime;
                warnings[sender] = 0;
                await sock.sendMessage(from, { text: `🔇 بس يا @${sender.split('@')[0]}! خدت كتم 10 دقايق عشان لسانك الطويل ده!`, mentions: [sender] });
            }
            return;
        }

        // 🏠 [أمر المنيو - الرد الإجباري بالوقت والمنشن]
        if (text === ".menu" || text === "اوامر" || text === ".اوامر") {
            const hour = new Date().getHours();
            const greeting = (hour < 12) ? "نهارك سعيد ☀️" : "مساء الفل 🌙";
            
            const menuMsg = `تـعـالـى يـا @${sender.split('@')[0]}، ${greeting}! 🇷🇺\n\n` +
            `*أوامـر روسـيـا V7 الـجـاهـزة:* \n` +
            `__________________________\n\n` +
            `🔹 اكتب *1* ➜ لـعـرض أوامـر الـتـحـمـيـل والـسـحـب\n` +
            `🔹 اكتب *2* ➜ لـمـعـلـومـات الـمـطـور (روسـيـا)\n\n` +
            `_رد برقم القسم عشان يفتح معاك فوراً!_`;

            if (fs.existsSync('./menu.png')) {
                await sock.sendMessage(from, { image: fs.readFileSync('./menu.png'), caption: menuMsg, mentions: [sender] }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { text: menuMsg, mentions: [sender] }, { quoted: msg });
            }
            return;
        }

        // 1️⃣ [قسم الأوامر - شغال إجباري]
        if (text === "1") {
            const list = `🛠️ *قـائـمـة أوامـر الـسـيـطـرة:* \n\n` +
            `• *.تنزيل* (اسم الأغنية) ➜ MP3\n` +
            `• *.تحميل* (اسم الفيديو) ➜ MP4\n` +
            `• *.ru* (بالرد أو منشن) ➜ سحب بروفايل\n` +
            `• *.ru2* (بالرد) ➜ فك ميديا المرة الواحدة\n` +
            `• *.فك* (بالمنشن) ➜ فك كتم الشخص\n` +
            `• *.الحالة* ➜ تقرير الروم الكامل`;
            await sock.sendMessage(from, { text: list }, { quoted: msg });
        }

        // 2️⃣ [قسم المطور - شغال إجباري]
        if (text === "2" || text === ".المطور") {
            const dev = `👑 *الـمـطـور روسـيـا (الـمـالـك)* 👑\n\n` +
            `👤 الاسم: روسيا\n` +
            `💻 التخصص: مبرمج سكربتات وبوتات\n` +
            `📱 واتساب: wa.me/201205848849\n` +
            `💬 الرسالة: روسيا بيحبك.. وسبب رأيك يخصني!`;
            await sock.sendMessage(from, { text: dev }, { quoted: msg });
        }

        // 👤 [أمر .ru - سحب البروفايل]
        if (text.startsWith(".ru") && !text.includes("2")) {
            let target = isGroup ? (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message.extendedTextMessage?.contextInfo?.participant) : from;
            if (!target && isGroup) return sock.sendMessage(from, { text: "❌ منشن للي عوز تسحب صورته!" });
            try {
                const pp = await sock.profilePictureUrl(target, 'image');
                await sock.sendMessage(from, { image: { url: pp }, caption: "📸 خد البروفايل اهو يا بطل!" });
            } catch { await sock.sendMessage(from, { text: "❌ الشخص ده قفل الخصوصية!" }); }
        }

        // 👁️ [أمر .ru2 - فك الـ View Once]
        if (text === ".ru2") {
            const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) return sock.sendMessage(from, { text: "❌ رد على ميديا مبعوتة مرة واحدة!" });
            const viewOnce = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message || quoted;
            const type = Object.keys(viewOnce)[0];
            const stream = await downloadContentFromMessage(viewOnce[type], type.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            await sock.sendMessage(from, { [type.replace('Message', '')]: buffer, caption: "تم الفضح بنجاح! 🔥🇷🇺" }, { quoted: msg });
        }

        // 🎵 [التحميل الصاروخي]
        if (text.startsWith(".تنزيل") && text.length > 7) {
            const query = text.replace(".تنزيل", "").trim();
            const search = await yts(query);
            const fileName = `./${Date.now()}.mp3`;
            execSync(`yt-dlp -x --audio-format mp3 -o "${fileName}" ${search.videos[0].url}`);
            await sock.sendMessage(from, { audio: fs.readFileSync(fileName), mimetype: 'audio/mpeg' }, { quoted: msg });
            fs.unlinkSync(fileName);
        }
    });

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'close') startRussiaBot();
        if (u.connection === 'open') console.log("✅ روسيا V7 Force: شغال وبيرد على الكل!");
    });
}
startRussiaBot();
