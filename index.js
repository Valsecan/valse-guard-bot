// index.js
const { Client, GatewayIntentBits, Partials, Events, AuditLogEvent, REST, Routes, SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');

require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BOT_OWNER_ID = process.env.BOT_OWNER_ID; // senin ID

// ===== Client =====
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
app.get('/', (req, res) => res.send('Guard bot aktif 😎'));
app.listen(8080, () => console.log('Web server 8080 portunda açık'));

// ===== Guard ve backup =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let guardSettings = {
  roleGuard: true,
  channelGuard: true,
  memberGuard: true,
  botGuard: true
};

// ===== Ceza fonksiyonu =====
async function punish(guild, userId, reason){
  if(whitelist.includes(userId) || userId === BOT_OWNER_ID) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if (!member) return;
  if (!member.manageable) return;

  await member.roles.set([]);
  if (client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ===== Slash komutlar =====
const commands = [
  new SlashCommandBuilder().setName('yardim').setDescription('Tüm komutları gösterir'),
  new SlashCommandBuilder().setName('whitelist').setDescription('Kişiyi whitelist ekle/kaldır').addUserOption(opt=>opt.setName('kisi').setDescription('Kişi ekle/kaldır')),
  new SlashCommandBuilder().setName('settings').setDescription('Guard ayarlarını değiştir').addStringOption(opt=>opt.setName('guard').setDescription('Aç/Kapat: role/channel/member/bot'))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ===== Bot hazır =====
client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  client.logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(()=>null);

  // Kanal ve rol backup
  const channels = await guild.channels.fetch();
  channels.forEach(ch => {
    backupChannels[ch.id] = { name: ch.name, type: ch.type, parentId: ch.parentId };
  });

  const roles = await guild.roles.fetch();
  roles.forEach(r => {
    backupRoles[r.id] = { name: r.name, color: r.color, permissions: r.permissions.bitfield, hoist: r.hoist, mentionable: r.mentionable };
  });

  // Slash komutları deploy et
  try {
    console.log('Slash komutları deploy ediliyor...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('Slash komutları yüklendi.');
  } catch(e) {
    console.error(e);
  }

  console.log("Guard sistemi aktif ve yedekler hazır");
});

// ===== Slash komut kullanımı =====
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isCommand()) return;
  if(interaction.user.id !== BOT_OWNER_ID && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: '⛔ Bu komutu kullanamazsın!', ephemeral: true });
  }

  const { commandName } = interaction;

  if(commandName === 'yardim'){
    return interaction.reply({
      content: `
/yardim - Komutları ve açıklamaları gösterir
/whitelist [kisi] - Kişiyi whitelist ekle/kaldır
/settings [guard] - Guard ayarlarını aç/kapat (role/channel/member/bot)
      `,
      ephemeral: true
    });
  }

  if(commandName === 'whitelist'){
    const kisi = interaction.options.getUser('kisi');
    if(!kisi) return interaction.reply({ content: 'Kişi belirtmelisin!', ephemeral: true });

    if(whitelist.includes(kisi.id)){
      whitelist = whitelist.filter(id => id !== kisi.id);
      return interaction.reply({ content: `${kisi.tag} whitelistten kaldırıldı.`, ephemeral: true });
    } else {
      whitelist.push(kisi.id);
      return interaction.reply({ content: `${kisi.tag} whitelist eklendi.`, ephemeral: true });
    }
  }

  if(commandName === 'settings'){
    const guard = interaction.options.getString('guard');
    if(!guard || !['role','channel','member','bot'].includes(guard)) return interaction.reply({ content: 'Geçersiz guard!', ephemeral: true });
    const key = guard+'Guard';
    guardSettings[key] = !guardSettings[key];
    return interaction.reply({ content: `${guard} guard ${guardSettings[key] ? 'aktif' : 'pasif'} oldu.`, ephemeral: true });
  }
});

// ===== Kanal silme/oluşturma guard =====
client.on(Events.ChannelDelete, async channel => {
  if(!guardSettings.channelGuard) return;
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
  if(!guardSettings.channelGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, "kanal oluşturma");
});

// ===== Rol silme/oluşturma guard =====
client.on(Events.RoleDelete, async role => {
  if(!guardSettings.roleGuard) return;
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
  if(!guardSettings.roleGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(role.guild, entry.executor.id, "rol oluşturma");
});

// ===== Üye guard (kick/ban) =====
client.on(Events.GuildMemberRemove, async member => {
  if(!guardSettings.memberGuard) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, "kick atma");
});

client.on(Events.GuildBanAdd, async ban => {
  if(!guardSettings.memberGuard) return;
  const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(ban.guild, entry.executor.id, "ban atma");
});

// ===== Bot ekleme guard =====
client.on(Events.GuildMemberAdd, async member => {
  if(!guardSettings.botGuard) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, "bot ekleme");
  await member.kick().catch(()=>null);
});

// ===== Bot login =====
client.login(TOKEN);
