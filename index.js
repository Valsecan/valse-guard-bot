// index.js
const { Client, GatewayIntentBits, Events, AuditLogEvent, Partials } = require('discord.js');
const express = require('express');

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
  partials: [Partials.Channel, Partials.GuildMember],
});

// Web server (Railway)
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// ===== Backup & Whitelist =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let settings = {
  channelGuard: true,
  roleGuard: true,
  memberGuard: true,
  botGuard: true,
};

// ===== Yardımcı Ceza Fonksiyonu =====
async function punish(guild, userId, reason) {
  if (whitelist.includes(userId) || userId === BOT_OWNER_ID) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member || !member.manageable) return;
  await member.roles.set([]);
  if (client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ===== Ready =====
client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  client.logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

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

// ===== Kanal Guard =====
client.on(Events.ChannelDelete, async channel => {
  if(!settings.channelGuard) return;

  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, "kanal silme");

  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({ name: data.name, type: data.type, parent: data.parentId });
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.ChannelCreate, async channel => {
  if(!settings.channelGuard) return;

  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, "kanal açma");
});

// ===== Rol Guard =====
client.on(Events.RoleDelete, async role => {
  if(!settings.roleGuard) return;

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
    if(client.logChannel) client.logChannel.send(`🟢 Rol geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.RoleCreate, async role => {
  if(!settings.roleGuard) return;

  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(role.guild, entry.executor.id, "rol oluşturma");
});

// ===== Üye Guard =====
client.on(Events.GuildBanAdd, async ban => {
  if(!settings.memberGuard) return;
  const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(ban.guild, entry.executor.id, "ban atma");
});

client.on(Events.GuildMemberRemove, async member => {
  if(!settings.memberGuard) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, "kick atma");
});

client.on(Events.GuildMemberAdd, async member => {
  if(!settings.botGuard) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry){
    punish(member.guild, entry.executor.id, "bot ekleme");
    await member.kick();
  }
});

// ===== Bot Login =====
client.login(TOKEN);
