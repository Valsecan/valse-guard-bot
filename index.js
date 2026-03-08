import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import mongoose from "mongoose";
import "dotenv/config";
import Whitelist from "./models/whitelist.js";

const client = new Client({ intents: Object.values(GatewayIntentBits) });

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER = process.env.BOT_OWNER_ID;
const LOG_CHANNEL = process.env.LOG_CHANNEL_ID;
const MONGO = process.env.MONGO_URI;

// MongoDB bağlan
mongoose.connect(MONGO, {}).then(() => console.log("MongoDB bağlı"));

// Log fonksiyonu
function log(guild, text){
  const channel = guild.channels.cache.get(LOG_CHANNEL);
  if(channel) channel.send({content: text});
}

// Hazır olunca
client.once("ready", () => console.log(`${client.user.tag} aktif`));

// Whitelist kontrol
async function isWhitelisted(id){
  if(id === OWNER) return true;
  const data = await Whitelist.findOne({ user: id });
  return !!data;
}

// Kanal guard
client.on("channelCreate", async channel => {
  const entry = (await channel.guild.fetchAuditLogs({type:1})).entries.first();
  const user = entry.executor;
  if(await isWhitelisted(user.id)) return;
  const member = channel.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(channel.guild, `🚨 Yetkisiz kanal açıldı: ${channel.name} / Açan: ${user.tag}`);
});

// Kanal silinirse
client.on("channelDelete", async channel => {
  log(channel.guild, `❌ Kanal silindi: ${channel.name}`);
  // Otomatik backup / restore burada eklenebilir
});

// Rol guard
client.on("roleCreate", async role => {
  const entry = (await role.guild.fetchAuditLogs({type:30})).entries.first();
  const user = entry.executor;
  if(await isWhitelisted(user.id)) return;
  const member = role.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(role.guild, `🚨 Yetkisiz rol açıldı: ${role.name} / Açan: ${user.tag}`);
});

// Kick guard
client.on("guildMemberRemove", async member => {
  const entry = (await member.guild.fetchAuditLogs({type:20})).entries.first();
  const user = entry?.executor;
  if(!user || await isWhitelisted(user.id)) return;
  const m = member.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz kick / Kişi: ${user.tag}`);
});

// Ban guard
client.on("guildBanAdd", async ban => {
  const entry = (await ban.guild.fetchAuditLogs({type:22})).entries.first();
  const user = entry?.executor;
  if(!user || await isWhitelisted(user.id)) return;
  ban.guild.members.unban(ban.user.id);
  const m = ban.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(ban.guild, `🚨 Yetkisiz ban / Kişi: ${user.tag}`);
});

// Bot guard
client.on("guildMemberAdd", async member => {
  if(!member.user.bot) return;
  const entry = (await member.guild.fetchAuditLogs({type:28})).entries.first();
  const user = entry?.executor;
  if(!user || await isWhitelisted(user.id)) return;
  await member.ban();
  const m = member.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz bot eklendi / Ekleyen: ${user.tag}`);
});

// Komut sistemi ve panel
client.on("messageCreate", async message => {
  if(!message.content.startsWith("!")) return;
  const args = message.content.split(" ");
  const cmd = args[0];

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
    if(!id) return;
    await Whitelist.create({ user: id });
    message.reply("Whitelist eklendi ✅");
  }
});

client.login(TOKEN);
