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
let guardSettings = {
  channel: true,
  role: true,
  kick: true,
  ban: true,
  bot: true
};

// Log fonksiyonu
function log(guild, text){
  if(guild.id !== GUILD_ID) return;
  const channel = guild.channels.cache.get(LOG_CHANNEL);
  if(channel) channel.send({content: text});
}

client.once("ready", () => console.log(`${client.user.tag} aktif`));

// Kanal oluşturulursa
client.on(Events.ChannelCreate, async channel => {
  if(!guardSettings.channel || channel.guild.id !== GUILD_ID) return;
  const entry = (await channel.guild.fetchAuditLogs({type:1})).entries.first();
  const user = entry.executor;
  if(whitelist.includes(user.id)) return;
  const member = channel.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  await channel.delete().catch(()=>{});
  log(channel.guild, `🚨 Yetkisiz kanal açıldı: ${channel.name} / Açan: ${user.tag}`);
});

// Kanal silinirse
client.on(Events.ChannelDelete, async channel => {
  if(channel.guild.id !== GUILD_ID) return;
  log(channel.guild, `❌ Kanal silindi: ${channel.name}`);
});

// Rol oluşturulursa
client.on(Events.RoleCreate, async role => {
  if(!guardSettings.role || role.guild.id !== GUILD_ID) return;
  const entry = (await role.guild.fetchAuditLogs({type:30})).entries.first();
  const user = entry.executor;
  if(whitelist.includes(user.id)) return;
  const member = role.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  await role.delete().catch(()=>{});
  log(role.guild, `🚨 Yetkisiz rol açıldı: ${role.name} / Açan: ${user.tag}`);
});

// Kick Guard
client.on(Events.GuildMemberRemove, async member => {
  if(!guardSettings.kick || member.guild.id !== GUILD_ID) return;
  const entry = (await member.guild.fetchAuditLogs({type:20})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const m = member.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz kick / Kişi: ${user.tag}`);
});

// Ban Guard
client.on(Events.GuildBanAdd, async ban => {
  if(!guardSettings.ban || ban.guild.id !== GUILD_ID) return;
  const entry = (await ban.guild.fetchAuditLogs({type:22})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  await ban.guild.members.unban(ban.user.id).catch(()=>{});
  const m = ban.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(ban.guild, `🚨 Yetkisiz ban / Kişi: ${user.tag}`);
});

// Bot Guard
client.on(Events.GuildMemberAdd, async member => {
  if(!guardSettings.bot || member.guild.id !== GUILD_ID) return;
  if(!member.user.bot) return;
  const entry = (await member.guild.fetchAuditLogs({type:28})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  await member.ban().catch(()=>{});
  const m = member.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz bot eklendi / Ekleyen: ${user.tag}`);
});

// Komut sistemi
client.on(Events.MessageCreate, async message => {
  if(message.guild?.id !== GUILD_ID) return;
  if(!message.content.startsWith("!")) return;

  const args = message.content.split(" ");
  const cmd = args[0];

  // Panel
  if(cmd === "!panel" && message.author.id === OWNER){
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("backup").setLabel("Backup").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("guard").setLabel("Guard Ayarları").setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setTitle("Guard Panel").setDescription("Butonlardan işlem yapabilirsiniz");
    message.channel.send({embeds:[embed], components:[row]});
  }

  // Whitelist ekleme
  if(cmd === "!whitelist" && message.author.id === OWNER){
    const id = args[1];
    if(!id) return message.reply("ID belirt.");
    whitelist.push(id);
    message.reply("Whitelist eklendi ✅");
  }

  // Backup placeholder
  if(cmd === "!backup" && message.author.id === OWNER){
    message.reply("Backup işlemleri burada olacak (placeholder).");
  }
});

// Buton etkileşimleri
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isButton() || interaction.guild?.id !== GUILD_ID) return;

  // Guard ayar paneli
  if(interaction.customId === "guard"){
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("channelGuard").setLabel(`Kanal Guard: ${guardSettings.channel ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("roleGuard").setLabel(`Rol Guard: ${guardSettings.role ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("kickGuard").setLabel(`Kick Guard: ${guardSettings.kick ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("banGuard").setLabel(`Ban Guard: ${guardSettings.ban ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("botGuard").setLabel(`Bot Guard: ${guardSettings.bot ? "✅" : "❌"}`).setStyle(ButtonStyle.Primary)
    );
    const embed = new EmbedBuilder().setTitle("Guard Ayarları").setDescription("Butonlara basarak guardları açıp kapatabilirsiniz");
    await interaction.update({embeds:[embed], components:[row]});
  }

  // Guard toggle
  if(["channelGuard","roleGuard","kickGuard","banGuard","botGuard"].includes(interaction.customId)){
    const key = interaction.customId.replace("Guard","").toLowerCase();
    guardSettings[key] = !guardSettings[key];
    await interaction.update({content:`${key} guard durumu: ${guardSettings[key] ? "✅ Açık" : "❌ Kapalı"}`, components:[]});
    log(interaction.guild, `⚙️ ${key} guard durumu değişti: ${guardSettings[key] ? "Açık" : "Kapalı"}`);
  }
});

client.login(TOKEN);
