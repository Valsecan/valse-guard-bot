const { Client, GatewayIntentBits, Partials, Events, AuditLogEvent, Collection } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ===== Web Server (Railway) =====
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// ===== Backup ve Sistem =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let guardSettings = {
  channelGuard: true,
  roleGuard: true,
  memberGuard: true,
  botGuard: true
};

// ===== Yardım ve Komutlar =====
client.commands = new Collection();

client.commands.set("yardim", {
  description: "Komutları ve ne işe yaradıklarını gösterir",
  execute: async (interaction) => {
    await interaction.reply(`
**Guard Bot Komutları:**
/yardim - Komutları ve ne işe yaradıklarını gösterir
/whitelist ekle <@kişi> - Dokunulmaz kişi ekler
/whitelist sil <@kişi> - Dokunulmaz kişiyi siler
/settings - Guardları açıp kapatabilirsin
    `);
  }
});

client.commands.set("whitelist", {
  description: "Whitelist ekleme/silme",
  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const member = interaction.options.getMember("kişi");
    if(sub === "ekle") {
      if(!whitelist.includes(member.id)) whitelist.push(member.id);
      await interaction.reply(`${member.user.tag} whitelist'e eklendi!`);
    } else if(sub === "sil") {
      whitelist = whitelist.filter(id => id !== member.id);
      await interaction.reply(`${member.user.tag} whitelist'ten çıkarıldı!`);
    }
  }
});

client.commands.set("settings", {
  description: "Guard ayarlarını açıp kapat",
  execute: async (interaction) => {
    const guard = interaction.options.getString("guard");
    const durum = interaction.options.getBoolean("durum");
    if(guard in guardSettings) {
      guardSettings[guard] = durum;
      await interaction.reply(`${guard} guard artık ${durum ? "aktif" : "kapalı"}`);
    } else {
      await interaction.reply(`Geçersiz guard!`);
    }
  }
});

// ===== Bot Ready =====
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
    backupRoles[r.id] = {
      name: r.name,
      color: r.color,
      permissions: r.permissions.bitfield,
      hoist: r.hoist,
      mentionable: r.mentionable
    };
  });

  console.log("Guard sistemi aktif ve yedekler hazır");
  if(client.logChannel) client.logChannel.send("Guard sistemi aktif ve yedekler hazır");
});

// ===== Ceza Fonksiyonu =====
async function punish(guild, userId, reason) {
  if(whitelist.includes(userId)) return;
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member || !member.manageable) return;
  await member.roles.set([]);
  if(client.logChannel) client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
}

// ===== Kanal Guard =====
client.on(Events.ChannelDelete, async channel => {
  if(!guardSettings.channelGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit:1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(channel.guild, executor.id, "kanal silme");

  const data = backupChannels[channel.id];
  if(data) await channel.guild.channels.create({ name:data.name, type:data.type, parent:data.parentId });
});

client.on(Events.ChannelCreate, async channel => {
  if(!guardSettings.channelGuard) return;
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit:1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(channel.guild, executor.id, "kanal açma");
});

// ===== Rol Guard =====
client.on(Events.RoleDelete, async role => {
  if(!guardSettings.roleGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit:1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(role.guild, executor.id, "rol silme");

  const data = backupRoles[role.id];
  if(data) await role.guild.roles.create(data);
});

client.on(Events.RoleCreate, async role => {
  if(!guardSettings.roleGuard) return;
  const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit:1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(role.guild, executor.id, "rol oluşturma");
});

// ===== Üye Guard =====
client.on(Events.GuildBanAdd, async ban => {
  if(!guardSettings.memberGuard) return;
  const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit:1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(ban.guild, executor.id, "ban atma");
});

client.on(Events.GuildMemberRemove, async member => {
  if(!guardSettings.memberGuard) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit:1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(member.guild, executor.id, "kick atma");
});

// ===== Bot Guard =====
client.on(Events.GuildMemberAdd, async member => {
  if(!member.user.bot) return;
  if(!guardSettings.botGuard) return;
  const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit:1 });
  const executor = audit.entries.first()?.executor;
  if(executor) punish(member.guild, executor.id, "bot ekleme");
  await member.kick();
});

// ===== Slash Komut Dinleyici =====
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if(!command) return;
  command.execute(interaction);
});

// ===== Bot Login =====
client.login(TOKEN);
