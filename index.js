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

client.once("ready", () => console.log(`${client.user.tag} aktif`));

// Panel komutu
client.on(Events.MessageCreate, async message => {
  if(message.author.id !== OWNER) return;
  if(message.content === "!panel"){
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("backup").setLabel("Backup").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("guard").setLabel("Guard Ayarları").setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setTitle("Guard Panel").setDescription("Butonlardan işlem yapabilirsiniz");
    message.channel.send({embeds:[embed], components:[row]});
  }
});

// Buton etkileşimleri
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isButton()) return;

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

  if(["channelGuard","roleGuard","kickGuard","banGuard","botGuard"].includes(interaction.customId)){
    const key = interaction.customId.replace("Guard","").toLowerCase();
    guardSettings[key] = !guardSettings[key];
    await interaction.update({content:`${key} guard durumu: ${guardSettings[key] ? "✅ Açık" : "❌ Kapalı"}`, components:[]});
    log(interaction.guild, `⚙️ ${key} guard durumu değişti: ${guardSettings[key] ? "Açık" : "Kapalı"}`);
  }
});

client.login(TOKEN);
