const { Client, GatewayIntentBits, Partials, Events, AuditLogEvent, SlashCommandBuilder, Routes, REST } = require('discord.js');
const express = require('express');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

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
app.get('/', (req, res) => res.send('Guard bot aktif 😎'));
app.listen(8080, () => console.log('Web server 8080 portunda açık'));

// ===== Backup sistemleri =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let guards = {
  kanal: true,
  rol: true,
  uye: true,
  bot: true
};

// ===== Yardımcı fonksiyonlar =====
async function punish(guild, userId, reason){
  if(whitelist.includes(userId)) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member) return;
  if(!member.manageable) return;
  await member.roles.set([]);
  if(client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı: ${reason}`);
}

// ===== Hazır komutlar =====
const commands = [
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Komutları ve ne işe yaradıklarını gösterir.'),
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Whitelist yönetimi')
    .addSubcommand(sub => sub.setName('ekle').setDescription('Kişiyi whitelist’e ekler').addUserOption(opt=>opt.setName('kullanici').setDescription('Kullanıcı').setRequired(true)))
    .addSubcommand(sub => sub.setName('sil').setDescription('Kişiyi whitelist’ten çıkarır').addUserOption(opt=>opt.setName('kullanici').setDescription('Kullanıcı').setRequired(true))),
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Guard sistemlerini açıp kapatır')
    .addStringOption(opt => opt.setName('guard').setDescription('Hangi guard?').setRequired(true).addChoices(
      {name:'kanal', value:'kanal'},
      {name:'rol', value:'rol'},
      {name:'uye', value:'uye'},
      {name:'bot', value:'bot'}
    ))
    .addStringOption(opt => opt.setName('durum').setDescription('ac/kapa').setRequired(true).addChoices(
      {name:'ac', value:'ac'},
      {name:'kapa', value:'kapa'}
    ))
];

// ===== Slash komut deploy =====
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async ()=>{
  try {
    console.log('Slash komutları deploy ediliyor...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Slash komutları yüklendi.');
  } catch(e){ console.error(e); }
})();

// ===== Ready =====
client.once(Events.ClientReady, async ()=>{
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
  if(client.logChannel) client.logChannel.send('Guard sistemi aktif ve yedekler hazır');
});

// ===== Komut handling =====
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  const memberId = interaction.user.id;

  if(cmd === 'yardim'){
    await interaction.reply({
      content: `
/yardim - Komutları gösterir
/whitelist ekle/sil @kullanici - Dokunulmaz ekle/kaldır
/settings guard ac/kapa - Guard sistemini aç/kapa
      `, ephemeral:true
    });
  } else if(cmd === 'whitelist'){
    if(memberId !== BOT_OWNER_ID) return interaction.reply({content:'Sadece bot sahibi kullanabilir', ephemeral:true});
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('kullanici');
    if(sub === 'ekle'){
      if(!whitelist.includes(user.id)) whitelist.push(user.id);
      await interaction.reply({content:`✅ ${user.tag} whitelist’e eklendi.`, ephemeral:true});
    } else if(sub === 'sil'){
      whitelist = whitelist.filter(id => id !== user.id);
      await interaction.reply({content:`❌ ${user.tag} whitelist’ten çıkarıldı.`, ephemeral:true});
    }
  } else if(cmd === 'settings'){
    if(memberId !== BOT_OWNER_ID) return interaction.reply({content:'Sadece bot sahibi kullanabilir', ephemeral:true});
    const guard = interaction.options.getString('guard');
    const durum = interaction.options.getString('durum');
    guards[guard] = durum === 'ac';
    await interaction.reply({content:`✅ ${guard} guard ${durum==='ac'?'açıldı':'kapatıldı'}`, ephemeral:true});
  }
});

// ===== Kanal guard =====
client.on(Events.ChannelDelete, async channel=>{
  if(!guards.kanal) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit:1 });
  const entry = audit.entries.first();
  if(!entry) return;
  punish(channel.guild, entry.executor.id, 'kanal silme');

  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({ name:data.name, type:data.type, parent:data.parentId });
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.ChannelCreate, async channel=>{
  if(!guards.kanal) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit:1 });
  const entry = audit.entries.first();
  if(!entry) return;
  punish(channel.guild, entry.executor.id, 'kanal açma');
});

// ===== Rol guard =====
client.on(Events.RoleDelete, async role=>{
  if(!guards.rol) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit:1 });
  const entry = audit.entries.first();
  if(!entry) return;
  punish(role.guild, entry.executor.id, 'rol silme');

  const data = backupRoles[role.id];
  if(data){
    await role.guild.roles.create({
      name:data.name, color:data.color, permissions:data.permissions,
      hoist:data.hoist, mentionable:data.mentionable
    });
    if(client.logChannel) client.logChannel.send(`🟢 Rol geri oluşturuldu: ${data.name}`);
  }
});

client.on(Events.RoleCreate, async role=>{
  if(!guards.rol) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit:1 });
  const entry = audit.entries.first();
  if(!entry) return;
  punish(role.guild, entry.executor.id, 'rol oluşturma');
});

// ===== Üye guard =====
client.on(Events.GuildMemberRemove, async member=>{
  if(!guards.uye) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, 'kick atma');
});

client.on(Events.GuildBanAdd, async ban=>{
  if(!guards.uye) return;
  const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(ban.guild, entry.executor.id, 'ban atma');
});

// ===== Bot ekleme guard =====
client.on(Events.GuildMemberAdd, async member=>{
  if(!guards.bot) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit:1 });
  const entry = audit.entries.first();
  if(entry) punish(member.guild, entry.executor.id, 'bot ekleme');
  if(member.kickable) await member.kick();
});

client.login(TOKEN);
