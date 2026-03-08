import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, AuditLogEvent, Partials, REST, Routes, SlashCommandBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
});

// Express web server (Railway)
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// Guard backup
let backupChannels = {};
let backupRoles = {};
let whitelist = [];

// Yardımcı fonksiyon: cezalandırma
async function punish(guild, userId, reason){
    if(whitelist.includes(userId) || userId === BOT_OWNER_ID) return;
    const member = await guild.members.fetch(userId).catch(()=>null);
    if(!member) return;
    if(!member.manageable) return;

    await member.roles.set([]);
    const log = await guild.channels.fetch(LOG_CHANNEL_ID).catch(()=>null);
    if(log) log.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// Komutları yükle
const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for(const file of commandFiles){
    const filePath = path.join('./commands', file);
    const { default: command } = await import(filePath);
    commands.push(command.data.toJSON());
}

// Slash komutları deploy
const rest = new REST({ version: '10' }).setToken(TOKEN);
await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_TOKEN, GUILD_ID), { body: commands });

// Bot hazır
client.once(Events.ClientReady, async () => {
    console.log(`Bot açıldı: ${client.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);

    // Kanal backup
    const channels = await guild.channels.fetch();
    channels.forEach(ch => {
        backupChannels[ch.id] = {
            name: ch.name,
            type: ch.type,
            parentId: ch.parentId
        };
    });

    // Rol backup
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

    console.log("Guard sistemi aktif ve yedekler hazır");
});

// Kanal oluşturulursa ve silinirse rol guard + backup
client.on(Events.ChannelCreate, async channel => {
    const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
    const entry = audit.entries.first();
    if(entry) punish(channel.guild, entry.executor.id, "kanal açma");
    
    // Kanal açılınca backup rolleri uygula
    Object.values(backupRoles).forEach(async roleData => {
        await channel.guild.roles.create({
            name: roleData.name,
            color: roleData.color,
            permissions: roleData.permissions,
            hoist: roleData.hoist,
            mentionable: roleData.mentionable
        }).catch(()=>{});
    });
});

client.on(Events.ChannelDelete, async channel => {
    const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
    const entry = audit.entries.first();
    if(entry) punish(channel.guild, entry.executor.id, "kanal silme");

    const data = backupChannels[channel.id];
    if(data){
        await channel.guild.channels.create({
            name: data.name,
            type: data.type,
            parent: data.parentId
        });
    }
});

// Rol oluşturma ve silme
client.on(Events.RoleCreate, async role => {
    const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
    const entry = audit.entries.first();
    if(entry) punish(role.guild, entry.executor.id, "rol oluşturma");
});

client.on(Events.RoleDelete, async role => {
    const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
    const entry = audit.entries.first();
    if(entry) punish(role.guild, entry.executor.id, "rol silme");

    const data = backupRoles[role.id];
    if(data){
        await role.guild.roles.create({
            name: data.name,
            color: data.color,
            permissions: data.permissions,
            hoist: data.hoist,
            mentionable: data.mentionable
        });
    }
});

// Ban / Kick / Bot ekleme
client.on(Events.GuildBanAdd, async ban => {
    const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
    const entry = audit.entries.first();
    if(entry) punish(ban.guild, entry.executor.id, "ban atma");
});

client.on(Events.GuildMemberRemove, async member => {
    const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
    const entry = audit.entries.first();
    if(entry) punish(member.guild, entry.executor.id, "kick atma");
});

client.on(Events.GuildMemberAdd, async member => {
    if(!member.user.bot) return;
    const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
    const entry = audit.entries.first();
    if(entry) punish(member.guild, entry.executor.id, "bot ekleme");
    await member.kick();
});

client.login(TOKEN);
