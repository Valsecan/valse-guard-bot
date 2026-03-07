// index.js
const { Client, GatewayIntentBits, Partials, Events, REST, Routes, AuditLogEvent, PermissionsBitField } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const APPLICATION_ID = process.env.APPLICATION_ID;
const OWNER_ID = process.env.OWNER_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ===== Web server =====
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif 😎"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// ===== Backup & whitelist =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [OWNER_ID];
let guardSettings = {
  channelGuard: true,
  roleGuard: true,
  memberGuard: true,
  botGuard: true
};

// ===== Ceza fonksiyonu =====
async function punish(guild, userId, reason){
  if(whitelist.includes(userId)) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member) return;
  if(!member.manageable) return;
  await member.roles.set([]);
  if(client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ===== Slash komutları =====
const commands = [
  {
    name: "yardim",
    description: "Komutları ve ne işe yaradıklarını gösterir"
  },
  {
    name: "whitelist",
    description: "Bir kullanıcıyı whitelist'e ekler/kaldırır",
    options: [
      { name: "ekle", type: 6, description: "Whitelist ekle", required: false },
      { name: "kaldir", type: 6, description: "Whitelist kaldır", required: false }
    ]
  },
  {
    name: "settings",
    description: "Guard ayarlarını açıp kapatır",
    options: [
      { name: "channelguard", type: 5, description: "Kanal guard aç/kapat", required: false },
      { name: "roleguard", type: 5, description: "Rol guard aç/kapat", required: false },
      { name: "memberguard", type: 5, description: "Üye guard aç/kapat", required: false },
      { name: "botguard", type: 5, description: "Bot ekleme guard aç/kapat", required: false }
    ]
  }
];

// Slash komut deploy
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log("Slash komutları deploy ediliyor...");
    await rest.put(
      Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID),
      { body: commands },
    );
    console.log("Slash komutları yüklendi.");
  } catch (err) {
    console.error(err);
  }
})();

// ===== Bot ready =====
client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  client.logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

  // Kanalları yedekle
  const channels = await guild.channels.fetch();
  channels.forEach(ch => {
    backupChannels[ch.id] = { name: ch.name, type: ch.type, parentId: ch.parentId };
  });

  // Rolleri yedekle
  const roles = await guild.roles.fetch();
  roles.forEach(r => {
    backupRoles[r.id] = { name: r.name, color: r.color, permissions: r.permissions.bitfield, hoist: r.hoist, mentionable: r.mentionable };
  });

  if(client.logChannel) client.logChannel.send("Guard sistemi aktif ve yedekler hazır");
});

// ===== Guard Eventleri =====
client.on(Events.ChannelDelete, async ch => {
  if(!guardSettings.channelGuard) return;
  const audit = await ch.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(ch.guild, entry.executor.id, "Kanal silme");

  const data = backupChannels[ch.id];
  if(data) {
    await ch.guild.channels.create({ name: data.name, type: data.type, parent: data.parentId });
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.RoleDelete, async r => {
  if(!guardSettings.roleGuard) return;
  const audit = await r.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(r.guild, entry.executor.id, "Rol silme");

  const data = backupRoles[r.id];
  if(data) {
    await r.guild.roles.create({
      name: data.name, color: data.color, permissions: data.permissions,
      hoist: data.hoist, mentionable: data.mentionable
    });
    if(client.logChannel) client.logChannel.send(`🟢 Rol geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.RoleCreate, async r => {
  if(!guardSettings.roleGuard) return;
  const audit = await r.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(r.guild, entry.executor.id, "Rol oluşturma");
});

client.on(Events.ChannelCreate, async ch => {
  if(!guardSettings.channelGuard) return;
  const audit = await ch.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(ch.guild, entry.executor.id, "Kanal açma");
});

client.on(Events.GuildMemberRemove, async m => {
  if(!guardSettings.memberGuard) return;
  const audit = await m.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(m.guild, entry.executor.id, "Kick atma");
});

client.on(Events.GuildBanAdd, async b => {
  if(!guardSettings.memberGuard) return;
  const audit = await b.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(b.guild, entry.executor.id, "Ban atma");
});

client.on(Events.GuildMemberAdd, async m => {
  if(!guardSettings.botGuard) return;
  if(!m.user.bot) return;
  const audit = await m.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry){
    punish(m.guild, entry.executor.id, "Bot ekleme");
    await m.kick();
  }
});

client.login(TOKEN);
