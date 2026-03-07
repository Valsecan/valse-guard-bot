import { Client, GatewayIntentBits, Partials, Events, AuditLogEvent, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
const CLIENT_ID = process.env.CLIENT_ID;

// ==== Client ====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ==== Web server ====
const app = express();
app.get("/", (req,res)=>res.send("Guard bot aktif 😎"));
app.listen(8080, ()=>console.log("Web server 8080 portunda açık"));

// ==== Backup & whitelist ====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let guards = {
  channel: true,
  role: true,
  member: true
};

// ==== Utility ====
async function punish(guild, userId, reason){
  if(whitelist.includes(userId)) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member || !member.manageable) return;
  await member.roles.set([]);
  if(client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ==== Ready ====
client.once(Events.ClientReady, async ()=>{
  console.log(`Bot açıldı: ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  client.logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

  // Kanal backup
  const channels = await guild.channels.fetch();
  channels.forEach(ch=>{
    backupChannels[ch.id] = {
      name: ch.name,
      type: ch.type,
      parentId: ch.parentId
    };
  });

  // Rol backup
  const roles = await guild.roles.fetch();
  roles.forEach(r=>{
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

// ==== Slash komutlar ====
const commands = [
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Tüm komutları ve açıklamalarını gösterir'),
  new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Kullanıcı ekle/kaldır')
    .addSubcommand(sub=>sub.setName('ekle').setDescription('Whitelist’e ekle').addUserOption(opt=>opt.setName('kullanici').setDescription('Kullanıcı').setRequired(true)))
    .addSubcommand(sub=>sub.setName('kaldir').setDescription('Whitelist’ten çıkar').addUserOption(opt=>opt.setName('kullanici').setDescription('Kullanıcı').setRequired(true))),
  new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Guard ayarlarını değiştir')
    .addBooleanOption(opt=>opt.setName('kanal').setDescription('Kanal guardını aç/kapat'))
    .addBooleanOption(opt=>opt.setName('rol').setDescription('Rol guardını aç/kapat'))
    .addBooleanOption(opt=>opt.setName('uye').setDescription('Üye guardını aç/kapat'))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async ()=>{
  try{
    console.log("Slash komutları deploy ediliyor...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Slash komutları yüklendi.");
  }catch(e){console.log(e);}
})();

// ==== Slash komut kullanımı ====
client.on(Events.InteractionCreate, async interaction=>{
  if(!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;
  const userId = interaction.user.id;
  if(![BOT_OWNER_ID].includes(userId) && !whitelist.includes(userId)){
    return interaction.reply({content:"🚫 Komutu kullanamazsınız!", ephemeral:true});
  }

  if(cmd==='yardim'){
    return interaction.reply({
      content:`/yardim - Komutları gösterir
/whitelist ekle/kaldır - Dokunulmaz kullanıcı ekle/kaldır
/settings - Guard ayarlarını aç/kapat`
    });
  }

  if(cmd==='whitelist'){
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('kullanici');
    if(sub==='ekle'){
      if(!whitelist.includes(user.id)) whitelist.push(user.id);
      return interaction.reply({content:`✅ ${user.tag} whitelist’e eklendi`, ephemeral:true});
    }else if(sub==='kaldir'){
      whitelist = whitelist.filter(id=>id!==user.id);
      return interaction.reply({content:`❌ ${user.tag} whitelist’ten çıkarıldı`, ephemeral:true});
    }
  }

  if(cmd==='settings'){
    const kanal = interaction.options.getBoolean('kanal');
    const rol = interaction.options.getBoolean('rol');
    const uye = interaction.options.getBoolean('uye');

    if(kanal!==null) guards.channel = kanal;
    if(rol!==null) guards.role = rol;
    if(uye!==null) guards.member = uye;

    return interaction.reply({content:`⚙️ Guard ayarları güncellendi`, ephemeral:true});
  }
});

// ==== Guardlar ====
// Kanal silme
client.on(Events.ChannelDelete, async channel=>{
  if(!guards.channel) return;
  const audit = await channel.guild.fetchAuditLogs({type:AuditLogEvent.ChannelDelete,limit:1});
  const entry = audit.entries.first();
  if(!entry) return;
  punish(channel.guild, entry.executor.id, "kanal silme");

  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({name:data.name,type:data.type,parent:data.parentId});
    if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

// Kanal açma
client.on(Events.ChannelCreate, async channel=>{
  if(!guards.channel) return;
  const audit = await channel.guild.fetchAuditLogs({type:AuditLogEvent.ChannelCreate,limit:1});
  const entry = audit.entries.first();
  if(!entry) return;
  punish(channel.guild, entry.executor.id, "kanal açma");
});

// Rol silme
client.on(Events.RoleDelete, async role=>{
  if(!guards.role) return;
  const audit = await role.guild.fetchAuditLogs({type:AuditLogEvent.RoleDelete,limit:1});
  const entry = audit.entries.first();
  if(!entry) return;
  punish(role.guild, entry.executor.id, "rol silme");

  const data = backupRoles[role.id];
  if(data){
    await role.guild.roles.create({
      name:data.name,
      color:data.color,
      permissions:data.permissions,
      hoist:data.hoist,
      mentionable:data.mentionable
    });
    if(client.logChannel) client.logChannel.send(`🟢 Rol geri oluşturuldu: ${data.name}`);
  }
});

// Rol oluşturma
client.on(Events.RoleCreate, async role=>{
  if(!guards.role) return;
  const audit = await role.guild.fetchAuditLogs({type:AuditLogEvent.RoleCreate,limit:1});
  const entry = audit.entries.first();
  if(!entry) return;
  punish(role.guild, entry.executor.id, "rol oluşturma");
});

// Ban guard
client.on(Events.GuildBanAdd, async ban=>{
  if(!guards.member) return;
  const audit = await ban.guild.fetchAuditLogs({type:AuditLogEvent.MemberBanAdd,limit:1});
  const entry = audit.entries.first();
  if(!entry) return;
  punish(ban.guild, entry.executor.id, "ban atma");
});

// Kick guard
client.on(Events.GuildMemberRemove, async member=>{
  if(!guards.member) return;
  const audit = await member.guild.fetchAuditLogs({type:AuditLogEvent.MemberKick,limit:1});
  const entry = audit.entries.first();
  if(!entry) return;
  punish(member.guild, entry.executor.id, "kick atma");
});

// Bot ekleme
client.on(Events.GuildMemberAdd, async member=>{
  if(!guards.member) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({type:AuditLogEvent.BotAdd,limit:1});
  const entry = audit.entries.first();
  if(!entry) return;
  punish(member.guild, entry.executor.id, "bot ekleme");
  await member.kick();
});

client.login(TOKEN);
