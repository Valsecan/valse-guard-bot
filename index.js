import { 
  Client, 
  GatewayIntentBits, 
  Partials,
  Events, 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";
import "dotenv/config";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel]
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const OWNER = process.env.BOT_OWNER_ID;

let logChannel;
let whitelist = [OWNER];
let guardSettings = {
  channel: true,
  role: true,
  kick: true,
  ban: true,
  bot: true
};
let backupChannels = {};
let backupRoles = {};

// Log fonksiyonu
function log(guild, text) {
  if(logChannel) logChannel.send({ content: text });
}

// Hazır olunca
client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

  // Kanalları yedekle
  const channels = await guild.channels.fetch();
  channels.forEach(ch => {
    backupChannels[ch.id] = {
      name: ch.name,
      type: ch.type,
      parentId: ch.parentId,
      permissionOverwrites: ch.permissionOverwrites.cache.map(p => ({
        id: p.id,
        allow: p.allow.bitfield,
        deny: p.deny.bitfield
      }))
    };
  });

  // Rolleri yedekle
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

  log(guild, "Guard sistemi aktif ve yedekler hazır ✅");
});

// Kullanıcıyı cezalandırma helper
async function punish(guild, userId, reason) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if(!member) return;
  if(member.roles.highest.position >= guild.members.me.roles.highest.position) return;
  await member.roles.set([]);
  log(guild, `🚨 ${member.user.tag} cezalandırıldı\nSebep: ${reason}`);
}

// Kanal oluşturma guard
client.on(Events.ChannelCreate, async channel => {
  if(!guardSettings.channel) return;

  const audit = await channel.guild.fetchAuditLogs({type:1, limit:1});
  const executor = audit.entries.first()?.executor;
  if(!executor || whitelist.includes(executor.id)) return;

  punish(channel.guild, executor.id, "Yetkisiz kanal oluşturdu");

  // Kanalın otomatik yedekten geri oluşturulması
  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({
      name: data.name,
      type: data.type,
      parent: data.parentId,
      permissionOverwrites: data.permissionOverwrites
    });
    log(channel.guild, `🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

// Kanal silme guard
client.on(Events.ChannelDelete, async channel => {
  if(!guardSettings.channel) return;

  const audit = await channel.guild.fetchAuditLogs({type:12, limit:1});
  const executor = audit.entries.first()?.executor;
  if(executor && !whitelist.includes(executor.id)){
    punish(channel.guild, executor.id, "Yetkisiz kanal sildi");
  }

  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({
      name: data.name,
      type: data.type,
      parent: data.parentId,
      permissionOverwrites: data.permissionOverwrites
    });
    log(channel.guild, `🟢 Kanal geri oluşturuldu: ${data.name}`);
  }
});

// Rol oluşturma guard
client.on(Events.RoleCreate, async role => {
  if(!guardSettings.role) return;

  const audit = await role.guild.fetchAuditLogs({type:30, limit:1});
  const executor = audit.entries.first()?.executor;
  if(!executor || whitelist.includes(executor.id)) return;

  punish(role.guild, executor.id, "Yetkisiz rol oluşturdu");
});

// Rol silme guard
client.on(Events.RoleDelete, async role => {
  if(!guardSettings.role) return;

  const audit = await role.guild.fetchAuditLogs({type:32, limit:1});
  const executor = audit.entries.first()?.executor;
  if(executor && !whitelist.includes(executor.id)){
    punish(role.guild, executor.id, "Yetkisiz rol sildi");
  }

  const data = backupRoles[role.id];
  if(data){
    await role.guild.roles.create({
      name: data.name,
      color: data.color,
      permissions: data.permissions,
      hoist: data.hoist,
      mentionable: data.mentionable
    });
    log(role.guild, `🟢 Rol geri oluşturuldu: ${data.name}`);
  }
});

// Kick guard
client.on(Events.GuildMemberRemove, async member => {
  if(!guardSettings.kick) return;

  const audit = await member.guild.fetchAuditLogs({type:20, limit:5});
  const entry = audit.entries.find(x=>x.target.id === member.id);
  if(entry && !whitelist.includes(entry.executor.id)){
    punish(member.guild, entry.executor.id, "Birini kickledi");
  }
});

// Ban guard
client.on(Events.GuildBanAdd, async ban => {
  if(!guardSettings.ban) return;

  const audit = await ban.guild.fetchAuditLogs({type:22, limit:5});
  const entry = audit.entries.find(x=>x.target.id===ban.user.id);
  if(entry && !whitelist.includes(entry.executor.id)){
    punish(ban.guild, entry.executor.id, "Birini banladı");
    await ban.guild.members.unban(ban.user.id);
  }
});

// Bot guard
client.on(Events.GuildMemberAdd, async member => {
  if(!guardSettings.bot) return;
  if(!member.user.bot) return;

  const audit = await member.guild.fetchAuditLogs({type:28, limit:5});
  const executor = audit.entries.first()?.executor;
  if(executor && !whitelist.includes(executor.id)){
    punish(member.guild, executor.id, "İzinsiz bot ekledi");
    await member.ban();
  }
});

// Komut sistemi ve panel
client.on(Events.MessageCreate, async message => {
  if(message.author.bot) return;
  if(!message.content.startsWith("!")) return;

  const args = message.content.split(" ");
  const cmd = args[0].toLowerCase();

  if(cmd === "!panel" && message.member.permissions.has("Administrator")){
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("backup").setLabel("Backup").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("guard").setLabel("Guard Ayarları").setStyle(ButtonStyle.Secondary)
    );
    const embed = new EmbedBuilder().setTitle("Guard Panel").setDescription("Butonlardan işlem yapabilirsiniz");
    message.channel.send({embeds:[embed], components:[row]});
  }

  if(cmd === "!whitelist" && message.member.permissions.has("Administrator")){
    const id = args[1];
    if(!id) return message.reply("ID belirtin!");
    whitelist.push(id);
    message.reply("✅ Whitelist eklendi");
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
