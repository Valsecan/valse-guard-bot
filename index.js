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
  const channel = guild.channels.cache.get(LOG_CHANNEL);
  if(channel) channel.send({content: text});
}

// Bot hazır olunca
client.once(Events.ClientReady, () => console.log(`${client.user.tag} aktif`));

// Kanal oluşturma guard
client.on(Events.ChannelCreate, async channel => {
  if(!guardSettings.channel) return;
  const entry = (await channel.guild.fetchAuditLogs({type:1})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const member = channel.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(channel.guild, `🚨 Yetkisiz kanal açıldı: ${channel.name} / Açan: ${user.tag}`);
});

// Kanal silme guard (backup için log)
client.on(Events.ChannelDelete, async channel => {
  if(!guardSettings.channel) return;
  log(channel.guild, `❌ Kanal silindi: ${channel.name}`);
});

// Rol oluşturma guard
client.on(Events.RoleCreate, async role => {
  if(!guardSettings.role) return;
  const entry = (await role.guild.fetchAuditLogs({type:30})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const member = role.guild.members.cache.get(user.id);
  if(member) await member.roles.set([]);
  log(role.guild, `🚨 Yetkisiz rol açıldı: ${role.name} / Açan: ${user.tag}`);
});

// Rol silme guard (log)
client.on(Events.RoleDelete, async role => {
  if(!guardSettings.role) return;
  log(role.guild, `❌ Rol silindi: ${role.name}`);
});

// Kick guard
client.on(Events.GuildMemberRemove, async member => {
  if(!guardSettings.kick) return;
  const entry = (await member.guild.fetchAuditLogs({type:20})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  const m = member.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz kick / Kişi: ${user.tag}`);
});

// Ban guard
client.on(Events.GuildBanAdd, async ban => {
  if(!guardSettings.ban) return;
  const entry = (await ban.guild.fetchAuditLogs({type:22})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  ban.guild.members.unban(ban.user.id);
  const m = ban.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(ban.guild, `🚨 Yetkisiz ban / Kişi: ${user.tag}`);
});

// Bot guard
client.on(Events.GuildMemberAdd, async member => {
  if(!guardSettings.bot) return;
  if(!member.user.bot) return;
  const entry = (await member.guild.fetchAuditLogs({type:28})).entries.first();
  const user = entry?.executor;
  if(!user || whitelist.includes(user.id)) return;
  await member.ban();
  const m = member.guild.members.cache.get(user.id);
  if(m) m.roles.set([]);
  log(member.guild, `🚨 Yetkisiz bot eklendi / Ekleyen: ${user.tag}`);
});

// Komut sistemi ve panel
client.on(Events.MessageCreate, async message => {
  if(message.author.id !== OWNER) return;
  const args = message.content.split(" ");
  const cmd = args[0].toLowerCase();

  if(cmd === "!panel"){
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("backup").setLabel("Backup").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("guard").setLabel("Guard Ayarları").setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setTitle("Guard Panel").setDescription("Butonlardan işlem yapabilirsiniz");
    message.channel.send({embeds:[embed], components:[row]});
  }

  if(cmd === "!whitelist"){
    const id = args[1];
    if(!id) return message.reply("Kullanıcı ID giriniz!");
    whitelist.push(id);
    message.reply(`✅ ${id} whitelist’e eklendi`);
  }
});

// Panel buton etkileşimleri
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isButton()) return;

  // Guard ayarları paneli
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

  // Guard aç/kapa butonları
  if(["channelGuard","roleGuard","kickGuard","banGuard","botGuard"].includes(interaction.customId)){
    const key = interaction.customId.replace("Guard","").toLowerCase();
    guardSettings[key] = !guardSettings[key];
    await interaction.update({content:`${key} guard durumu: ${guardSettings[key] ? "✅ Açık" : "❌ Kapalı"}`, components:[]});
    log(interaction.guild, `⚙️ ${key} guard durumu değişti: ${guardSettings[key] ? "Açık" : "Kapalı"}`);
  }

  // Whitelist ve Backup butonları (sadece mesaj ile panel eklenebilir)
  if(interaction.customId === "whitelist") await interaction.reply({content:"Whitelist butonu tıklandı!", ephemeral:true});
  if(interaction.customId === "backup") await interaction.reply({content:"Backup butonu tıklandı!", ephemeral:true});
});

client.login(TOKEN);
