// index.js
import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from "discord.js";

import "dotenv/config";

const client = new Client({ intents: Object.values(GatewayIntentBits) });

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER = process.env.BOT_OWNER_ID;
const LOG_CHANNEL = process.env.LOG_CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;

// Guard durumları
let guards = {
  kanalGuard: true,
  rolGuard: true,
  kickGuard: true,
  banGuard: true,
  botGuard: true,
};

// Whitelist
let whitelist = [OWNER];

// Log fonksiyonu
function log(guild, text) {
  const channel = guild.channels.cache.get(LOG_CHANNEL);
  if (channel) channel.send({ content: text });
}

// Guard panel butonlarına basınca
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.user.id !== OWNER) return;

  const id = interaction.customId;

  if (id === "toggleKanal") {
    guards.kanalGuard = !guards.kanalGuard;
    await interaction.reply({ content: `Kanal Guard ${guards.kanalGuard ? "aktif ✅" : "pasif ❌"}`, ephemeral: true });
  }
  if (id === "toggleRol") {
    guards.rolGuard = !guards.rolGuard;
    await interaction.reply({ content: `Rol Guard ${guards.rolGuard ? "aktif ✅" : "pasif ❌"}`, ephemeral: true });
  }
  if (id === "toggleKick") {
    guards.kickGuard = !guards.kickGuard;
    await interaction.reply({ content: `Kick Guard ${guards.kickGuard ? "aktif ✅" : "pasif ❌"}`, ephemeral: true });
  }
  if (id === "toggleBan") {
    guards.banGuard = !guards.banGuard;
    await interaction.reply({ content: `Ban Guard ${guards.banGuard ? "aktif ✅" : "pasif ❌"}`, ephemeral: true });
  }
  if (id === "toggleBot") {
    guards.botGuard = !guards.botGuard;
    await interaction.reply({ content: `Bot Guard ${guards.botGuard ? "aktif ✅" : "pasif ❌"}`, ephemeral: true });
  }
  if (id === "whitelist") {
    await interaction.reply({ content: `Whitelist sistemi bu panelden kullanılamıyor, !whitelist komutunu kullan`, ephemeral: true });
  }
});

// Kanal açılınca
client.on("channelCreate", async channel => {
  if (!guards.kanalGuard) return;
  if (channel.guild.id !== GUILD_ID) return;
  const entry = (await channel.guild.fetchAuditLogs({ type: 1 })).entries.first();
  const user = entry.executor;
  if (whitelist.includes(user.id)) return;
  const member = channel.guild.members.cache.get(user.id);
  if (member) await member.roles.set([]);
  log(channel.guild, `🚨 Yetkisiz kanal açıldı: ${channel.name} / Açan: ${user.tag}`);
});

// Kanal silinince
client.on("channelDelete", async channel => {
  if (channel.guild.id !== GUILD_ID) return;
  log(channel.guild, `❌ Kanal silindi: ${channel.name}`);
});

// Rol açılınca
client.on("roleCreate", async role => {
  if (!guards.rolGuard) return;
  if (role.guild.id !== GUILD_ID) return;
  const entry = (await role.guild.fetchAuditLogs({ type: 30 })).entries.first();
  const user = entry.executor;
  if (whitelist.includes(user.id)) return;
  const member = role.guild.members.cache.get(user.id);
  if (member) await member.roles.set([]);
  log(role.guild, `🚨 Yetkisiz rol açıldı: ${role.name} / Açan: ${user.tag}`);
});

// Kick Guard
client.on("guildMemberRemove", async member => {
  if (!guards.kickGuard) return;
  if (member.guild.id !== GUILD_ID) return;
  const entry = (await member.guild.fetchAuditLogs({ type: 20 })).entries.first();
  const user = entry?.executor;
  if (!user || whitelist.includes(user.id)) return;
  const m = member.guild.members.cache.get(user.id);
  if (m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz kick / Kişi: ${user.tag}`);
});

// Ban Guard
client.on("guildBanAdd", async ban => {
  if (!guards.banGuard) return;
  if (ban.guild.id !== GUILD_ID) return;
  const entry = (await ban.guild.fetchAuditLogs({ type: 22 })).entries.first();
  const user = entry?.executor;
  if (!user || whitelist.includes(user.id)) return;
  await ban.guild.members.unban(ban.user.id);
  const m = ban.guild.members.cache.get(user.id);
  if (m) m.roles.set([]);
  log(ban.guild, `🚨 Yetkisiz ban / Kişi: ${user.tag}`);
});

// Bot Guard
client.on("guildMemberAdd", async member => {
  if (!guards.botGuard) return;
  if (member.guild.id !== GUILD_ID) return;
  if (!member.user.bot) return;
  const entry = (await member.guild.fetchAuditLogs({ type: 28 })).entries.first();
  const user = entry?.executor;
  if (!user || whitelist.includes(user.id)) return;
  await member.ban();
  const m = member.guild.members.cache.get(user.id);
  if (m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz bot eklendi / Ekleyen: ${user.tag}`);
});

// Komut sistemi ve panel
client.on("messageCreate", async message => {
  if (message.guild.id !== GUILD_ID) return;
  if (!message.content.startsWith("!")) return;
  const args = message.content.split(" ");
  const cmd = args[0];

  if (cmd === "!panel" && message.author.id === OWNER) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId("toggleKanal").setLabel(`Kanal Guard: ${guards.kanalGuard ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("toggleRol").setLabel(`Rol Guard: ${guards.rolGuard ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("toggleKick").setLabel(`Kick Guard: ${guards.kickGuard ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("toggleBan").setLabel(`Ban Guard: ${guards.banGuard ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("toggleBot").setLabel(`Bot Guard: ${guards.botGuard ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Success)
      );
    const embed = new EmbedBuilder().setTitle("Guard Panel").setDescription("Butonlardan Guard ayarlarını değiştirebilirsin");
    message.channel.send({ embeds: [embed], components: [row] });
  }

  if (cmd === "!whitelist" && message.author.id === OWNER) {
    const id = args[1];
    if (!id) return message.reply("ID girmelisin");
    whitelist.push(id);
    message.reply(`Whitelist eklendi: ${id}`);
  }
});

client.once("ready", () => console.log(`${client.user.tag} aktif`));

client.login(TOKEN);
