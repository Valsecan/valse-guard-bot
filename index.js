import { Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const OWNER_ID = process.env.BOT_OWNER_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

// Web server
const app = express();
app.get("/", (req,res)=>res.send("Bot çalışıyor"));
app.listen(8080,()=>console.log("Web server 8080 portunda açık"));

let logChannel;
let backupChannels = {};
let backupRoles = {};
let whitelist = [OWNER_ID];

// Guard ayarları
let guardSettings = {
  channel: true,
  role: true,
  kick: true,
  ban: true,
  bot: true
};

// Helper: cezalandırma (rolleri sıfırlar)
async function punish(guild, userId, reason){
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member) return;
  if(member.roles.highest.position >= guild.members.me.roles.highest.position) return;
  await member.roles.set([]);
  if(logChannel) logChannel.send(`🚨 ${member.user.tag} cezalandırıldı\nSebep: ${reason}`);
}

// Ready
client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

  // Kanalları yedekle
  const channels = await guild.channels.fetch();
  channels.forEach(ch=>{
    backupChannels[ch.id] = {
      name: ch.name,
      type: ch.type,
      parentId: ch.parentId,
      permissionOverwrites: ch.permissionOverwrites.cache.map(p=>({
        id: p.id,
        allow: p.allow.bitfield,
        deny: p.deny.bitfield
      }))
    };
  });

  // Rolleri yedekle
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

  if(logChannel) logChannel.send("Guard sistemi aktif ve yedekler hazır");
});

// PANEL KOMUTU
client.on(Events.MessageCreate, async message => {
  if(message.author.id !== OWNER_ID) return;
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

// BUTON ETKİLEŞİMLERİ
client.on(Events.InteractionCreate, async interaction => {
  if(!interaction.isButton()) return;
  if(interaction.user.id !== OWNER_ID){
    await interaction.reply({content:"Sadece bot sahibi kullanabilir!", ephemeral:true});
    return;
  }

  // Guard ayarları
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
    if(logChannel) logChannel.send(`⚙️ ${key} guard durumu değişti: ${guardSettings[key] ? "Açık" : "Kapalı"}`);
  }

  // Whitelist ekleme
  if(interaction.customId === "whitelist"){
    whitelist.push(interaction.user.id);
    await interaction.reply({content:"Whitelist eklendi ✅", ephemeral:true});
  }

  // Backup kanalları ve rolleri yedekle
  if(interaction.customId === "backup"){
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    channels.forEach(ch=>{
      backupChannels[ch.id] = {
        name: ch.name,
        type: ch.type,
        parentId: ch.parentId,
        permissionOverwrites: ch.permissionOverwrites.cache.map(p=>({
          id: p.id,
          allow: p.allow.bitfield,
          deny: p.deny.bitfield
        }))
      };
    });
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
    await interaction.reply({content:"Backup tamam ✅", ephemeral:true});
  }
});

// KANAL CREATE GUARD
client.on(Events.ChannelCreate, async channel => {
  if(!guardSettings.channel) return;
  const audit = await channel.guild.fetchAuditLogs({ type: 1, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(!executor || whitelist.includes(executor.id)) return;
  punish(channel.guild, executor.id, "Yetkisiz kanal oluşturdu");
});

// ROL CREATE GUARD
client.on(Events.RoleCreate, async role => {
  if(!guardSettings.role) return;
  const audit = await role.guild.fetchAuditLogs({ type: 30, limit: 1 });
  const executor = audit.entries.first()?.executor;
  if(!executor || whitelist.includes(executor.id)) return;
  punish(role.guild, executor.id, "Yetkisiz rol oluşturdu");
});

// KICK GUARD
client.on(Events.GuildMemberRemove, async member=>{
  if(!guardSettings.kick) return;
  const audit = await member.guild.fetchAuditLogs({type:20, limit:5});
  const entry = audit.entries.find(x=>x.target.id===member.id);
  if(entry && !whitelist.includes(entry.executor.id)) punish(member.guild, entry.executor.id, "Birini kickledi");
});

// BAN GUARD
client.on(Events.GuildBanAdd, async ban=>{
  if(!guardSettings.ban) return;
  const audit = await ban.guild.fetchAuditLogs({type:22, limit:5});
  const entry = audit.entries.find(x=>x.target.id===ban.user.id);
  if(entry && !whitelist.includes(entry.executor.id)) punish(ban.guild, entry.executor.id, "Birini banladı");
});

// BOT GUARD
client.on(Events.GuildMemberAdd, async member=>{
  if(!guardSettings.bot) return;
  if(!member.user.bot) return;
  const audit = await member.guild.fetchAuditLogs({type:28, limit:5});
  const executor = audit.entries.first()?.executor;
  if(executor && !whitelist.includes(executor.id)) punish(member.guild, executor.id, "İzinsiz bot ekledi");
});

client.login(TOKEN);
