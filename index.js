// index.js
const { Client, GatewayIntentBits, Events, Partials, AuditLogEvent, REST, Routes } = require('discord.js');
const express = require('express');
const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ===== Web server (Railway) =====
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif 😎"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// ===== Backup =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let settings = {
  kanalGuard: true,
  rolGuard: true,
  uyeGuard: true,
  botGuard: true
};

// ===== Hazır komut listesi =====
const commands = [
  {
    name: 'yardim',
    description: 'Guard komutları hakkında bilgi verir'
  },
  {
    name: 'whitelist',
    description: 'Kullanıcıları dokunulmaz yap veya çıkar',
    options: [
      { name: 'user', type: 6, description: 'Kullanıcı', required: true },
      { name: 'action', type: 3, description: 'add veya remove', required: true, choices: [
        { name: 'add', value: 'add' },
        { name: 'remove', value: 'remove' }
      ]}
    ]
  },
  {
    name: 'settings',
    description: 'Guardları açıp kapatabilirsin',
    options: [
      { name: 'guard', type: 3, description: 'Kapat/aç', required: true, choices: [
        { name: 'kanal', value: 'kanal' },
        { name: 'rol', value: 'rol' },
        { name: 'uye', value: 'uye' },
        { name: 'bot', value: 'bot' }
      ]},
      { name: 'action', type: 3, description: 'on/off', required: true }
    ]
  }
];

// ===== Slash komutları deploy et =====
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Slash komutları deploy ediliyor...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Slash komutları yüklendi!');
  } catch (err) { console.error(err); }
})();

// ===== Ready =====
client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  client.logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

  // Kanal backup
  const channels = await guild.channels.fetch();
  channels.forEach(ch => {
    backupChannels[ch.id] = { name: ch.name, type: ch.type, parentId: ch.parentId };
  });

  // Rol backup
  const roles = await guild.roles.fetch();
  roles.forEach(r => {
    backupRoles[r.id] = { name: r.name, color: r.color, permissions: r.permissions.bitfield, hoist: r.hoist, mentionable: r.mentionable };
  });

  console.log('Guard sistemi aktif ve yedekler hazır');
  if(client.logChannel) client.logChannel.send('Guard sistemi aktif ve yedekler hazır ✅');
});

// ===== Ceza fonksiyonu =====
async function punish(guild, userId, reason){
  if(whitelist.includes(userId)) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member) return;
  if(!member.manageable) return;
  await member.roles.set([]);
  if(client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ===== Guard Eventleri =====
// Kanal silme
client.on(Events.ChannelDelete, async channel => {
  if(!settings.kanalGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, 'kanal silme');

  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({ name: data.name, type: data.type, parent: data.parentId });
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

// Kanal açma
client.on(Events.ChannelCreate, async channel => {
  if(!settings.kanalGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, 'kanal açma');
});

// Rol silme
client.on(Events.RoleDelete, async role => {
  if(!settings.rolGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(role.guild, entry.executor.id, 'rol silme');

  const data = backupRoles[role.id];
  if(data){
    await role.guild.roles.create({
      name: data.name, color: data.color, permissions: data.permissions,
      hoist: data.hoist, mentionable: data.mentionable
    });
    if(client.logChannel) client.logChannel.send(`🟢 Rol geri oluşturuldu: ${data.name}`);
  }
});

// Rol oluşturma
client.on(Events.RoleCreate, async role => {
  if(!settings.rolGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(role.guild, entry.executor.id, 'rol oluşturma');
});

// Ban guard
client.on(Events.GuildBanAdd, async ban => {
  if(!settings.uyeGuard) return;
  const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(ban.guild, entry.executor.id, 'ban atma');
});

// Kick guard
client.on(Events.GuildMemberRemove, async member => {
  if(!settings.uyeGuard) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, 'kick atma');
});

// Bot ekleme guard
client.on(Events.GuildMemberAdd, async member => {
  if(!settings.botGuard) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, 'bot ekleme');
  await member.kick();
});

// ===== Komut sistemi =====
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if(commandName === 'yardim'){
    return interaction.reply(`
**Guard Komutları**
/yardim - Komutları gösterir
/whitelist - Dokunulmaz kişileri ekler/çıkarır
/settings - Guardları açıp kapatır
`);
  }

  if(commandName === 'whitelist'){
    const user = interaction.options.getUser('user');
    const action = interaction.options.getString('action');
    if(action === 'add'){
      if(!whitelist.includes(user.id)) whitelist.push(user.id);
      return interaction.reply(`${user.tag} whitelist’e eklendi ✅`);
    } else {
      whitelist = whitelist.filter(id => id !== user.id);
      return interaction.reply(`${user.tag} whitelist’ten çıkarıldı ❌`);
    }
  }

  if(commandName === 'settings'){
    const guard = interaction.options.getString('guard');
    const action = interaction.options.getString('action');
    const state = action === 'on';
    if(guard === 'kanal') settings.kanalGuard = state;
    if(guard === 'rol') settings.rolGuard = state;
    if(guard === 'uye') settings.uyeGuard = state;
    if(guard === 'bot') settings.botGuard = state;
    return interaction.reply(`${guard} guard ${state ? 'aktif' : 'pasif'} ✅`);
  }
});

// ===== Bot login =====
client.login(TOKEN);
