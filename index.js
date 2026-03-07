import { Client, GatewayIntentBits, Events, AuditLogEvent, Partials } from "discord.js";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Channel]
});

// Web server (Railway uyumlu)
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// Guard ve Backup
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let settings = {
    rolGuard: true,
    kanalGuard: true,
    banGuard: true,
    kickGuard: true,
    botGuard: true
};

// Ceza fonksiyonu
async function punish(guild, userId, reason) {
    if (whitelist.includes(userId) || userId === BOT_OWNER_ID) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (!member.manageable) return;
    await member.roles.set([]);
    const log = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (log) log.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// Guard Backupları
async function backupAll(guild) {
    // Kanallar
    const channels = await guild.channels.fetch();
    channels.forEach(ch => {
        backupChannels[ch.id] = { name: ch.name, type: ch.type, parentId: ch.parentId };
    });
    // Roller
    const roles = await guild.roles.fetch();
    roles.forEach(r => {
        backupRoles[r.id] = {
            name: r.name,
            color: r.color,
            permissions: r.permissions.bitfield,
            hoist: r.hoist,
            mentionable: r.mentionable
        };
    });
}

client.once(Events.ClientReady, async () => {
    console.log(`Bot açıldı: ${client.user.tag}`);
    const guild = await client.guilds.fetch(GUILD_ID);
    await backupAll(guild);
    console.log("Guard sistemi aktif ve yedekler hazır");
});

// Kanal Silme Guard
client.on(Events.ChannelDelete, async channel => {
    if (!settings.kanalGuard) return;
    const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
    const entry = audit.entries.first();
    if (!entry) return;
    punish(channel.guild, entry.executor.id, "kanal silme");

    // Kanal backup
    const data = backupChannels[channel.id];
    if (data) {
        await channel.guild.channels.create({ name: data.name, type: data.type, parent: data.parentId });
        const log = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (log) log.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
    }
});

// Rol Silme Guard + Rolleri Al
client.on(Events.RoleDelete, async role => {
    if (!settings.rolGuard) return;
    const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
    const entry = audit.entries.first();
    if (!entry) return;
    punish(role.guild, entry.executor.id, "rol silme");

    // Rol backup
    const data = backupRoles[role.id];
    if (data) {
        const newRole = await role.guild.roles.create({ name: data.name, color: data.color, permissions: data.permissions, hoist: data.hoist, mentionable: data.mentionable });
        // Tüm üyelerin rollerini sıfırla
        role.guild.members.cache.forEach(m => m.roles.remove(role.id).catch(() => {}));
        const log = role.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (log) log.send(`🟢 Rol geri oluşturuldu ve roller alındı: ${data.name}`);
    }
});

// Rol Oluşturma Guard + Rolleri Al
client.on(Events.RoleCreate, async role => {
    if (!settings.rolGuard) return;
    const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
    const entry = audit.entries.first();
    if (!entry) return;
    punish(role.guild, entry.executor.id, "rol oluşturma");
    role.guild.members.cache.forEach(m => m.roles.remove(role.id).catch(() => {}));
});

client.login(TOKEN);
