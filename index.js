import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  Events 
} from "discord.js";
import "dotenv/config";

const client = new Client({ intents: Object.values(GatewayIntentBits) });

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER = process.env.BOT_OWNER_ID;
const LOG_CHANNEL = process.env.LOG_CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;

let whitelist = [OWNER];

// Guard ayarları
let guards = {
  channelGuard: true,
  roleGuard: true,
  kickGuard: true,
  banGuard: true,
  botGuard: true,
};

// Log fonksiyonu
function log(guild, text) {
  const channel = guild.channels.cache.get(LOG_CHANNEL);
  if(channel) channel.send({ content: text });
}

// Panel oluşturma
async function showPanel(message) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("toggle_channel")
        .setLabel(`Kanal Guard: ${guards.channelGuard ? "✅" : "❌"}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("toggle_role")
        .setLabel(`Rol Guard: ${guards.roleGuard ? "✅" : "❌"}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("toggle_kick")
        .setLabel(`Kick Guard: ${guards.kickGuard ? "✅" : "❌"}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("toggle_ban")
        .setLabel(`Ban Guard: ${guards.banGuard ? "✅" : "❌"}`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("toggle_bot")
        .setLabel(`Bot Guard: ${guards.botGuard ? "✅" : "❌"}`)
        .setStyle(ButtonStyle.Primary)
    );

  const embed = new EmbedBuilder()
    .setTitle("Guard Panel")
    .setDescription("Butonlardan guard ayarlarını açıp kapatabilirsiniz");

  await message.channel.send({ embeds: [embed], components: [row] });
}

// Butonlara basılınca
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isButton()) return;
  if(interaction.user.id !== OWNER) return;

  switch(interaction.customId){
    case "toggle_channel":
      guards.channelGuard = !guards.channelGuard;
      break;
    case "toggle_role":
      guards.roleGuard = !guards.roleGuard;
      break;
    case "toggle_kick":
      guards.kickGuard = !guards.kickGuard;
      break;
    case "toggle_ban":
      guards.banGuard = !guards.banGuard;
      break;
    case "toggle_bot":
      guards.botGuard = !guards.botGuard;
      break;
  }

  await interaction.update({ content: "Guard ayarları güncellendi ✅", components: [] });
});

// Kanal oluşturulursa
client.on("channelCreate", async channel => {
  if(!guards.channelGuard || channel.guild.id !== GUILD_ID) return;
  const entry = (await channel.guild.fetchAuditLogs({ type: 1 })).entries.first();
  const user = entry.executor;
  if(whitelist.includes(user.id)) return;
  const member = channel.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(channel.guild, `🚨 Yetkisiz kanal açıldı: ${channel.name} / Açan: ${user.tag}`);
});

// Kanal silinirse
client.on("channelDelete", async channel => {
  if(channel.guild.id !== GUILD_ID) return;
  log(channel.guild, `❌ Kanal silindi: ${channel.name}`);
  // Buraya backup sistemi eklenebilir
});

// Rol oluşturulursa
client.on("roleCreate", async role => {
  if(!guards.roleGuard || role.guild.id !== GUILD_ID) return;
  const entry = (await role.guild.fetchAuditLogs({ type: 30 })).entries.first();
  const user = entry.executor;
  if(whitelist.includes(user.id)) return;
  const member = role.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(role.guild, `🚨 Yetkisiz rol açıldı: ${role.name} / Açan: ${user.tag}`);
});

// Kick Guard
client.on("guildMemberRemove", async member => {
  if(!guards.kickGuard || member.guild.id !== GUILD_ID) return;
  const entry = (await member.guild.fetchAuditLogs({ type: 20 })).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const m = member.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz kick / Kişi: ${user.tag}`);
});

// Ban Guard
client.on("guildBanAdd", async ban => {
  if(!guards.banGuard || ban.guild.id !== GUILD_ID) return;
  const entry = (await ban.guild.fetchAuditLogs({ type: 22 })).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  ban.guild.members.unban(ban.user.id);
  const m = ban.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(ban.guild, `🚨 Yetkisiz ban / Kişi: ${user.tag}`);
});

// Bot Guard
client.on("guildMemberAdd", async member => {
  if(!guards.botGuard || member.guild.id !== GUILD_ID) return;
  if(!member.user.bot) return;
  const entry = (await member.guild.fetchAuditLogs({ type: 28 })).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  await member.ban();
  const m = member.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz bot eklendi / Ekleyen: ${user.tag}`);
});

// Komut sistemi
client.on("messageCreate", async message => {
  if(message.guild.id !== GUILD_ID) return;
  if(!message.content.startsWith("!")) return;

  const args = message.content.split(" ");
  const cmd = args[0];

  if(cmd === "!panel" && message.author.id === OWNER){
    await showPanel(message);
  }

  if(cmd === "!whitelist" && message.author.id === OWNER){
    const id = args[1];
    if(!id) return message.reply("Bir ID gir!");
    whitelist.push(id);
    message.reply("Whitelist eklendi ✅");
  }
});

client.login(TOKEN);
