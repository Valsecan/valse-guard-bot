const { Client, GatewayIntentBits, Partials, Events, AuditLogEvent, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js');
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
  partials: [Partials.GuildMember]
});

// ===== Web server (Railway) =====
const app = express();
app.get('/', (req, res) => res.send('Guard bot aktif'));
app.listen(8080, () => console.log('Web server 8080 portunda açık'));

// ===== Guard Backup =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let guardSettings = {
  channelGuard: true,
  roleGuard: true,
  memberGuard: true,
  botGuard: true
};

// ===== Helper: Ceza =====
async function punish(guild, userId, reason) {
  if(whitelist.includes(userId) || userId === BOT_OWNER_ID) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member || !member.manageable) return;
  await member.roles.set([]).catch(()=>null);
  if(client.logChannel) client.logChannel.send(`⚠️ ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ===== Ready =====
client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  client.logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(()=>null);

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
  if(!guardSettings.channelGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, "kanal silme");

  const data = backupChannels[channel.id];
  if(data) {
    await channel.guild.channels.create({
      name: data.name,
      type: data.type,
      parent: data.parentId
    });
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.ChannelCreate, async channel => {
  if(!guardSettings.channelGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, "kanal açma");
});

// ===== Rol Guard & Backup =====
client.on(Events.RoleDelete, async role => {
  if(!guardSettings.roleGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(role.guild, entry.executor.id, "rol silme");

  const backup = backupRoles[role.id];
  if(!backup) return;
  const newRole = await role.guild.roles.create({
    name: backup.name,
    color: backup.color,
    permissions: backup.permissions,
    hoist: backup.hoist,
    mentionable: backup.mentionable,
    reason: 'Rol geri yükleme'
  });
  if(client.logChannel) client.logChannel.send(`🟢 Rol geri oluşturuldu: ${newRole.name}`);
});

client.on(Events.RoleCreate, async role => {
  if(!guardSettings.roleGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(role.guild, entry.executor.id, "rol oluşturma");
});

// ===== Üye Guard =====
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

// ===== Bot Guard =====
client.on(Events.GuildMemberAdd, async member => {
  if(!guardSettings.botGuard) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, "bot ekleme");
  await member.kick().catch(()=>null);
});

// ===== Slash Komutlar =====
const commands = [
  new SlashCommandBuilder().setName('yardim').setDescription('Komutları ve ne işe yaradıklarını gösterir'),
  new SlashCommandBuilder().setName('whitelist').setDescription('Kişiyi whitelist ekle/kaldır').addUserOption(opt => opt.setName('kisi').setDescription('Kullanıcı')),
  new SlashCommandBuilder().setName('settings').setDescription('Guard ayarlarını aç/kapat')
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Slash komutları deploy ediliyor...');
    await rest.put(Routes.applicationGuildCommands(client.user?.id, GUILD_ID), { body: commands });
    console.log('Slash komutları yüklendi.');
  } catch(e) { console.error(e); }
})();

// Komut handling
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if(commandName === 'yardim') {
    await interaction.reply(`
**Guard Bot Komutları:**
/yardim - Komutları ve ne işe yaradıklarını gösterir
/whitelist - Kullanıcıyı whitelist ekle/kaldır
/settings - Guard ayarlarını aç/kapat
`);
  }

  else if(commandName === 'whitelist') {
    if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'Yönetici olmalısın', ephemeral: true });
    const user = interaction.options.getUser('kisi');
    if(!user) return interaction.reply({ content: 'Kullanıcı seçmelisin', ephemeral: true });

    if(whitelist.includes(user.id)) {
      whitelist = whitelist.filter(u => u !== user.id);
      await interaction.reply({ content: `${user.tag} whitelistten çıkarıldı.` });
    } else {
      whitelist.push(user.id);
      await interaction.reply({ content: `${user.tag} whitelist’e eklendi.` });
    }
  }

  else if(commandName === 'settings') {
    if(interaction.user.id !== BOT_OWNER_ID) return interaction.reply({ content: 'Yalnızca bot sahibi kullanabilir', ephemeral: true });

    // Basit toggle örneği
    guardSettings.channelGuard = !guardSettings.channelGuard;
    guardSettings.roleGuard = !guardSettings.roleGuard;
    guardSettings.memberGuard = !guardSettings.memberGuard;
    guardSettings.botGuard = !guardSettings.botGuard;

    await interaction.reply({ content: `Guard ayarları güncellendi: ${JSON.stringify(guardSettings)}`, ephemeral: true });
  }
});

client.login(TOKEN);
