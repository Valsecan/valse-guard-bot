const { Client, GatewayIntentBits, Events } = require("discord.js");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ]
});

// web server
const app = express();
app.get("/", (req,res)=>res.send("Bot çalışıyor"));
app.listen(8080,()=>console.log("Web server 8080 portunda açık"));

let logChannel;

// BACKUP
let backupChannels = {};
let backupRoles = {};

// Ready
client.once("clientReady", async () => {
  console.log(Bot açıldı: ${client.user.tag});

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

  console.log("Guard sistemi aktif ve yedekler hazır");
  if(logChannel) logChannel.send("Guard sistemi aktif ve yedekler hazır");
});

// Helper: rollerini alma
async function punish(guild, userId, reason){
  const member = await guild.members.fetch(userId).catch(()=>null);
  if(!member) return;
  if(member.roles.highest.position >= guild.members.me.roles.highest.position) return;
  await member.roles.set([]);
  if(logChannel) logChannel.send(🚨 ${member.user.tag} cezalandırıldı\nSebep: ${reason});
}

// KANAL DELETE GUARD
client.on(Events.ChannelDelete, async channel=>{
  const audit = await channel.guild.fetchAuditLogs({type:12, limit:1}); // CHANNEL_DELETE
  const executor = audit.entries.first()?.executor;
  if(executor) punish(channel.guild, executor.id, "Kanal sildi");

  const data = backupChannels[channel.id];
  if(data){
    await channel.guild.channels.create({
      name: data.name,
      type: data.type,
      parent: data.parentId,
      permissionOverwrites: data.permissionOverwrites
    });
    if(logChannel) logChannel.send(🟢 Kanal geri oluşturuldu: ${data.name});
  }
});

// ROL DELETE GUARD
client.on(Events.RoleDelete, async role=>{
  const audit = await role.guild.fetchAuditLogs({type:32, limit:1}); // ROLE_DELETE
  const executor = audit.entries.first()?.executor;
  if(executor) punish(role.guild, executor.id, "Rol sildi");

  const data = backupRoles[role.id];
  if(data){
    await role.guild.roles.create({
      name: data.name,
      color: data.color,
      permissions: data.permissions,
      hoist: data.hoist,
      mentionable: data.mentionable
    });
    if(logChannel) logChannel.send(🟢 Rol geri oluşturuldu: ${data.name});
  }
});

// BAN GUARD
client.on(Events.GuildBanAdd, async ban=>{
  const audit = await ban.guild.fetchAuditLogs({type:22, limit:5});
  const entry = audit.entries.find(x=>x.target.id===ban.user.id);
  if(entry) punish(ban.guild, entry.executor.id, "Birini banladı");
});

// KICK GUARD
client.on(Events.GuildMemberRemove, async member=>{
  const audit = await member.guild.fetchAuditLogs({type:20, limit:5});
  const entry = audit.entries.find(x=>x.target.id===member.id);
  if(entry) punish(member.guild, entry.executor.id, "Birini kickledi");
});

// ROL VERME GUARD
client.on(Events.GuildMemberUpdate, async (oldMember,newMember)=>{
  if(oldMember.roles.cache.size >= newMember.roles.cache.size) return;
  const audit = await newMember.guild.fetchAuditLogs({type:25, limit:5});
  const entry = audit.entries.first();
  if(entry) punish(newMember.guild, entry.executor.id, "İzinsiz rol verdi");
});

client.login(TOKEN);
