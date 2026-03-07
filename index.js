require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, AuditLogEvent, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const APPLICATION_ID = process.env.APPLICATION_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ===== Web server =====
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif 😎"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// ===== Guard durumları =====
let guards = {
  channelGuard: true,
  roleGuard: true,
  memberGuard: true,
  banGuard: true,
  kickGuard: true,
  botGuard: true
};

// ===== Whitelist =====
let whitelist = [];

// ===== Backup =====
let backupChannels = {};
let backupRoles = {};

// ===== Yardımcı cezalandırma fonksiyonu =====
async function punish(guild, userId, reason){
  if(whitelist.includes(userId)) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member || !member.manageable) return;
  await member.roles.set([]);
  if(client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ===== Ready =====
client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  client.logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

  // Kanal yedekleme
  const channels = await guild.channels.fetch();
  channels.forEach(ch => {
    backupChannels[ch.id] = { name: ch.name, type: ch.type, parentId: ch.parentId };
  });

  // Rol yedekleme
  const roles = await guild.roles.fetch();
  roles.forEach(r => {
    backupRoles[r.id] = {
      name: r.name,
      color: r.color,
      permissions: BigInt(r.permissions.bitfield),
      hoist: r.hoist,
      mentionable: r.mentionable
    };
  });

  console.log("Guard sistemi aktif ve yedekler hazır");
  if(client.logChannel) client.logChannel.send("Guard sistemi aktif ve yedekler hazır");
});

// ===== Kanal silme guard =====
client.on(Events.ChannelDelete, async channel => {
  if(!guards.channelGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) await punish(channel.guild, executor.id, "kanal silme");

  const data = backupChannels[channel.id];
  if(data) {
    await channel.guild.channels.create({ name: data.name, type: data.type, parent: data.parentId });
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

// ===== Kanal açma guard =====
client.on(Events.ChannelCreate, async channel => {
  if(!guards.channelGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) await punish(channel.guild, executor.id, "kanal açma");
});

// ===== Rol silme guard =====
client.on(Events.RoleDelete, async role => {
  if(!guards.roleGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) await punish(role.guild, executor.id, "rol silme");

  const data = backupRoles[role.id];
  if(data){
    await role.guild.roles.create({
      name: data.name,
      color: data.color,
      permissions: BigInt(data.permissions),
      hoist: data.hoist,
      mentionable: data.mentionable
    });
    if(client.logChannel) client.logChannel.send(`🟢 Rol geri oluşturuldu: ${data.name}`);
  }
});

// ===== Rol oluşturma guard =====
client.on(Events.RoleCreate, async role => {
  if(!guards.roleGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) await punish(role.guild, executor.id, "rol oluşturma");
});

// ===== Kick guard =====
client.on(Events.GuildMemberRemove, async member => {
  if(!guards.kickGuard) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) await punish(member.guild, executor.id, "kick atma");
});

// ===== Ban guard =====
client.on(Events.GuildBanAdd, async ban => {
  if(!guards.banGuard) return;
  const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) await punish(ban.guild, executor.id, "ban atma");
});

// ===== Bot ekleme guard =====
client.on(Events.GuildMemberAdd, async member => {
  if(!guards.botGuard) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(executor) await punish(member.guild, executor.id, "bot ekleme");
  await member.kick();
});

// ===== Komutlar =====
const commands = [
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Guard bot komutlarını gösterir'),
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Kullanıcı ekle/kaldır')
    .addUserOption(opt => opt.setName('kullanici').setDescription('Kullanıcı seç')),
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Guard ayarlarını değiştir')
    .addStringOption(opt => opt.setName('guard').setDescription('Hangi guard? (channel/role/member/ban/kick/bot)'))
    .addStringOption(opt => opt.setName('durum').setDescription('Durum: ac/kapat'))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Slash komutları deploy ediliyor...');
    await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID), { body: commands });
    console.log('Slash komutları yüklendi.');
  } catch(err) {
    console.error(err);
  }
})();

client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if(commandName === 'yardim'){
    interaction.reply(`Komutlar:
- /yardim : Komutları gösterir
- /whitelist : Dokunulmaz kullanıcı ekle/kaldır
- /settings : Guardları açıp kapatabilirsin`);
  }

  if(commandName === 'whitelist'){
    const user = interaction.options.getUser('kullanici');
    if(!user) return interaction.reply({ content: 'Kullanıcı belirt!', ephemeral: true });
    if(whitelist.includes(user.id)){
      whitelist = whitelist.filter(id => id !== user.id);
      interaction.reply({ content: `${user.tag} whitelistten çıkarıldı`, ephemeral: true });
    } else {
      whitelist.push(user.id);
      interaction.reply({ content: `${user.tag} whitelist eklendi`, ephemeral: true });
    }
  }

  if(commandName === 'settings'){
    const guard = interaction.options.getString('guard');
    const durum = interaction.options.getString('durum');
    if(!guards.hasOwnProperty(guard)) return interaction.reply({ content: 'Geçersiz guard!', ephemeral: true });
    if(durum === 'ac') guards[guard] = true;
    if(durum === 'kapat') guards[guard] = false;
    interaction.reply({ content: `${guard} guard durumu: ${guards[guard]}`, ephemeral: true });
  }
});

// ===== Bot login =====
client.login(TOKEN);
