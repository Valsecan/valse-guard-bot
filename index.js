import { Client, GatewayIntentBits, Partials, Events, AuditLogEvent, SlashCommandBuilder, Routes } from 'discord.js';
import express from 'express';
import dotenv from 'dotenv';
import { REST } from '@discordjs/rest';

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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ===== Web server (Railway) =====
const app = express();
app.get('/', (req, res) => res.send('Guard bot aktif 😎'));
app.listen(8080, () => console.log('Web server 8080 portunda açık'));

// ===== Guard sistemleri =====
let guardSettings = {
  kanalGuard: true,
  rolGuard: true,
  uyeGuard: true,
  botGuard: true
};

let backupChannels = {};
let backupRoles = {};
let whitelist = [];

// ===== Slash komutları =====
const commands = [
  new SlashCommandBuilder().setName('yardim').setDescription('Komutları gösterir'),
  new SlashCommandBuilder().setName('whitelist').setDescription('Whitelist ekle/kaldır').addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı seçin')),
  new SlashCommandBuilder().setName('settings').setDescription('Guardları aç/kapat').addStringOption(o => o.setName('guard').setDescription('Hangi guard?').setRequired(true).addChoices(
    { name: 'Kanal', value: 'kanalGuard' },
    { name: 'Rol', value: 'rolGuard' },
    { name: 'Üye', value: 'uyeGuard' },
    { name: 'Bot', value: 'botGuard' }
  ))
];

// Slash deploy
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Slash komutları deploy ediliyor...');
    await rest.put(Routes.applicationGuildCommands(BOT_OWNER_ID, GUILD_ID), { body: commands });
    console.log('Slash komutları yüklendi.');
  } catch (e) { console.error(e); }
})();

// ===== Yardımcı fonksiyon =====
async function punish(guild, userId, reason){
  if(whitelist.includes(userId) || userId === BOT_OWNER_ID) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member) return;
  if(!member.manageable) return;
  await member.roles.set([]);
  if(client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

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
  if(client.logChannel) client.logChannel.send('Guard sistemi aktif ve yedekler hazır');
});

// ===== Slash komut dinleme =====
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const userId = interaction.user.id;

  if(![BOT_OWNER_ID, ...whitelist].includes(userId)){
    return interaction.reply({ content: '❌ Komutu kullanamazsın!', ephemeral: true });
  }

  if(commandName === 'yardim'){
    return interaction.reply({ content: `
/yardim - Komutları gösterir
/whitelist @kullanici - Whitelist ekle/kaldır
/settings guard - Guardları aç/kapat
`, ephemeral: true });
  }

  if(commandName === 'whitelist'){
    const target = interaction.options.getUser('kullanici');
    if(!target) return interaction.reply({ content: '❌ Kullanıcı seçin', ephemeral: true });
    if(whitelist.includes(target.id)){
      whitelist = whitelist.filter(id => id !== target.id);
      return interaction.reply({ content: `✅ ${target.tag} whitelistten kaldırıldı`, ephemeral: true });
    } else {
      whitelist.push(target.id);
      return interaction.reply({ content: `✅ ${target.tag} whitelist eklendi`, ephemeral: true });
    }
  }

  if(commandName === 'settings'){
    const guard = interaction.options.getString('guard');
    if(!guard) return interaction.reply({ content: '❌ Guard seçin', ephemeral: true });
    guardSettings[guard] = !guardSettings[guard];
    return interaction.reply({ content: `✅ ${guard} guard ${guardSettings[guard] ? 'aktif' : 'pasif'}`, ephemeral: true });
  }
});

// ===== Kanal Guard =====
client.on(Events.ChannelDelete, async channel => {
  if(!guardSettings.kanalGuard) return;

  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(channel.guild, executor.id, 'kanal silme');

  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({ name: data.name, type: data.type, parent: data.parentId });
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.ChannelCreate, async channel => {
  if(!guardSettings.kanalGuard) return;

  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(channel.guild, executor.id, 'kanal açma');
});

// ===== Rol Guard =====
client.on(Events.RoleDelete, async role => {
  if(!guardSettings.rolGuard) return;

  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(role.guild, executor.id, 'rol silme');

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
  if(!guardSettings.rolGuard) return;

  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(role.guild, executor.id, 'rol oluşturma');
});

// ===== Üye Guard =====
client.on(Events.GuildMemberRemove, async member => {
  if(!guardSettings.uyeGuard) return;

  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(member.guild, executor.id, 'kick atma');
});

client.on(Events.GuildBanAdd, async ban => {
  if(!guardSettings.uyeGuard) return;

  const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(ban.guild, executor.id, 'ban atma');
});

// ===== Bot Guard =====
client.on(Events.GuildMemberAdd, async member => {
  if(!guardSettings.botGuard) return;
  if(!member.user.bot) return;

  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(member.guild, executor.id, 'bot ekleme');
  await member.kick();
});

client.login(TOKEN);
