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
  partials: [Partials.Channel, Partials.GuildMember]
});

// ===== Web server =====
const app = express();
app.get('/', (req, res) => res.send('Guard bot aktif 😎'));
app.listen(8080, () => console.log('Web server 8080 portunda açık'));

// ===== Backup =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let guards = {
  kanalGuard: true,
  rolGuard: true,
  uyeGuard: true,
  botGuard: true
};

// ===== Slash komutları =====
const commands = [
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Komutları ve ne işe yaradıklarını gösterir'),

  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Kullanıcıları whitelist\'e ekler/çıkarır')
    .addUserOption(opt => opt.setName('kullanici').setDescription('Whitelist eklenecek/çıkarılacak kullanıcı').setRequired(true))
    .addStringOption(opt => opt.setName('islem').setDescription('ekle/kaldir').setRequired(true)),

  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Guard ayarlarını aç/kapat')
    .addStringOption(opt => opt.setName('guard').setDescription('guard seç: kanalGuard, rolGuard, uyeGuard, botGuard').setRequired(true))
    .addStringOption(opt => opt.setName('durum').setDescription('ac/kapat').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Slash komutları deploy ediliyor...');
    await rest.put(Routes.applicationGuildCommands(client.user?.id || BOT_OWNER_ID, GUILD_ID), { body: commands });
    console.log('Slash komutları yüklendi.');
  } catch (err) {
    console.log(err);
  }
})();

// ===== Hazır =====
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

  console.log('Guard sistemi aktif ve yedekler hazır');
});

// ===== Ceza =====
async function punish(guild, userId, reason) {
  if (whitelist.includes(userId)) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  if (!member.manageable) return;
  await member.roles.set([]);
  if (client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ===== Guard eventleri =====
client.on(Events.ChannelDelete, async channel => {
  if(!guards.kanalGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, 'kanal silme');

  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({ name: data.name, type: data.type, parent: data.parentId });
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.ChannelCreate, async channel => {
  if(!guards.kanalGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(channel.guild, entry.executor.id, 'kanal açma');
});

client.on(Events.RoleDelete, async role => {
  if(!guards.rolGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(role.guild, entry.executor.id, 'rol silme');

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
  if(!guards.rolGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(role.guild, entry.executor.id, 'rol oluşturma');
});

client.on(Events.GuildBanAdd, async ban => {
  if(!guards.uyeGuard) return;
  const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(ban.guild, entry.executor.id, 'ban atma');
});

client.on(Events.GuildMemberRemove, async member => {
  if(!guards.uyeGuard) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, 'kick atma');
});

client.on(Events.GuildMemberAdd, async member => {
  if(!guards.botGuard) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
  const entry = audit.entries.first();
  if(entry){
    punish(member.guild, entry.executor.id, 'bot ekleme');
    await member.kick();
  }
});

// ===== Slash komutları =====
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isChatInputCommand()) return;

  // Sadece owner ve whitelist
  if(![BOT_OWNER_ID, ...whitelist].includes(interaction.user.id)) return interaction.reply({ content: '❌ Yetkin yok!', ephemeral: true });

  const { commandName } = interaction;

  if(commandName === 'yardim'){
    interaction.reply({
      content: `
/yardim → Komutları gösterir
/whitelist → Kullanıcı ekle/kaldır
/settings → Guardları aç/kapat (kanalGuard, rolGuard, uyeGuard, botGuard)
      `,
      ephemeral: true
    });
  }

  if(commandName === 'whitelist'){
    const user = interaction.options.getUser('kullanici');
    const islem = interaction.options.getString('islem');
    if(islem === 'ekle'){
      if(!whitelist.includes(user.id)) whitelist.push(user.id);
      interaction.reply({ content: `${user.tag} whitelist'e eklendi.`, ephemeral: true });
    } else if(islem === 'kaldir'){
      whitelist = whitelist.filter(id => id !== user.id);
      interaction.reply({ content: `${user.tag} whitelist'ten çıkarıldı.`, ephemeral: true });
    } else {
      interaction.reply({ content: 'Geçersiz işlem!', ephemeral: true });
    }
  }

  if(commandName === 'settings'){
    const guard = interaction.options.getString('guard');
    const durum = interaction.options.getString('durum');

    if(!guards.hasOwnProperty(guard)) return interaction.reply({ content: '❌ Geçersiz guard!', ephemeral: true });

    if(durum === 'ac') guards[guard] = true;
    else if(durum === 'kapat') guards[guard] = false;
    else return interaction.reply({ content: '❌ Geçersiz durum! (ac/kapat)', ephemeral: true });

    interaction.reply({ content: `✅ ${guard} guard durumu: ${guards[guard]}`, ephemeral: true });
  }
});

client.login(TOKEN);
