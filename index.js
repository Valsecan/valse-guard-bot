// index.js
import { 
  Client, GatewayIntentBits, AuditLogEvent, Partials,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} from "discord.js";
import "dotenv/config";

const client = new Client({
  intents: Object.values(GatewayIntentBits),
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message]
});

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER = process.env.BOT_OWNER_ID;
const LOG_CHANNEL = process.env.LOG_CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;

let whitelist = [OWNER];

// Log fonksiyonu
function log(guild, text){
  const channel = guild.channels.cache.get(LOG_CHANNEL);
  if(channel) channel.send({content: text});
}

// Bot hazır
client.once("ready", () => console.log(`${client.user.tag} aktif`));

// Kanal oluşturulursa
client.on("channelCreate", async channel => {
  if(channel.guild.id !== GUILD_ID) return;
  const entry = (await channel.guild.fetchAuditLogs({type: AuditLogEvent.ChannelCreate, limit:1})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const member = channel.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(channel.guild, `🚨 Yetkisiz kanal açıldı: ${channel.name} / Açan: ${user.tag}`);
});

// Kanal silinirse
client.on("channelDelete", async channel => {
  if(channel.guild.id !== GUILD_ID) return;
  const entry = (await channel.guild.fetchAuditLogs({type: AuditLogEvent.ChannelDelete, limit:1})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const member = channel.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(channel.guild, `❌ Kanal silindi: ${channel.name} / Silen: ${user.tag}`);
});

// Rol oluşturulursa
client.on("roleCreate", async role => {
  if(role.guild.id !== GUILD_ID) return;
  const entry = (await role.guild.fetchAuditLogs({type: AuditLogEvent.RoleCreate, limit:1})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const member = role.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(role.guild, `🚨 Yetkisiz rol açıldı: ${role.name} / Açan: ${user.tag}`);
});

// Rol silinirse
client.on("roleDelete", async role => {
  if(role.guild.id !== GUILD_ID) return;
  const entry = (await role.guild.fetchAuditLogs({type: AuditLogEvent.RoleDelete, limit:1})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const member = role.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(role.guild, `❌ Rol silindi: ${role.name} / Silen: ${user.tag}`);
});

// Kick guard
client.on("guildMemberRemove", async member => {
  if(member.guild.id !== GUILD_ID) return;
  const entry = (await member.guild.fetchAuditLogs({type: AuditLogEvent.MemberKick, limit:1})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const m = member.guild.members.cache.get(user.id);
  if(m) await m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz kick / Kişi: ${user.tag}`);
});

// Ban guard
client.on("guildBanAdd", async ban => {
  if(ban.guild.id !== GUILD_ID) return;
  const entry = (await ban.guild.fetchAuditLogs({type: AuditLogEvent.MemberBanAdd, limit:1})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  await ban.guild.members.unban(ban.user.id);
  const m = ban.guild.members.cache.get(user.id);
  if(m) await m.roles.set([]);
  log(ban.guild, `🚨 Yetkisiz ban / Kişi: ${user.tag}`);
});

// Bot guard
client.on("guildMemberAdd", async member => {
  if(member.guild.id !== GUILD_ID || !member.user.bot) return;
  const entry = (await member.guild.fetchAuditLogs({type: AuditLogEvent.BotAdd, limit:1})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  await member.ban();
  const m = member.guild.members.cache.get(user.id);
  if(m) await m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz bot eklendi / Ekleyen: ${user.tag}`);
});

// Komut ve panel sistemi
client.on("messageCreate", async message => {
  if(message.author.bot) return;
  if(message.guild.id !== GUILD_ID) return;
  const args = message.content.split(" ");
  const cmd = args[0].toLowerCase();

  if(cmd === "!panel" && message.author.id === OWNER){
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("backup").setLabel("Backup").setStyle(ButtonStyle.Primary)
      );
    const embed = new EmbedBuilder().setTitle("Guard Panel").setDescription("Butonlardan işlem yapabilirsiniz");
    message.channel.send({embeds:[embed],components:[row]});
  }

  if(cmd === "!whitelist" && message.author.id === OWNER){
    const id = args[1];
    if(!id) return message.reply("ID giriniz!");
    if(whitelist.includes(id)) return message.reply("Zaten whitelist'te!");
    whitelist.push(id);
    message.reply("Whitelist eklendi ✅");
  }
});

client.login(TOKEN);
