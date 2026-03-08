import {
Client,
GatewayIntentBits,
EmbedBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
Events,
AuditLogEvent
} from "discord.js";
import "dotenv/config";

const client = new Client({
intents: Object.values(GatewayIntentBits)
});

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER = process.env.BOT_OWNER_ID;
const LOG = process.env.LOG_CHANNEL_ID;

let whitelist = [OWNER];

let guard = {
channel: true,
role: true,
kick: true,
ban: true,
bot: true
};

function log(guild,msg){
const ch = guild.channels.cache.get(LOG);
if(ch) ch.send(msg);
}

client.once(Events.ClientReady,()=>{
console.log(`${client.user.tag} aktif`);
});

client.on(Events.MessageCreate, async msg => {

if(msg.author.id !== OWNER) return;

if(msg.content === "!panel"){

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId("backup").setLabel("Backup").setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId("guardpanel").setLabel("Guard Ayarları").setStyle(ButtonStyle.Secondary)
);

const embed = new EmbedBuilder()
.setTitle("ATHENA GUARD PANEL")
.setDescription("Guard sistemini buradan yönetebilirsin");

msg.channel.send({embeds:[embed],components:[row]});
}

if(msg.content.startsWith("!whitelist")){
const id = msg.content.split(" ")[1];
if(!id) return msg.reply("ID gir.");

whitelist.push(id);

msg.reply(`Whitelist eklendi: ${id}`);
}

});

client.on(Events.InteractionCreate, async interaction=>{

if(!interaction.isButton()) return;

if(interaction.user.id !== OWNER)
return interaction.reply({content:"Yetkin yok",ephemeral:true});

if(interaction.customId === "whitelist"){

interaction.reply({
content:"Whitelist eklemek için komut kullan:\n`!whitelist USER_ID`",
ephemeral:true
});

}

if(interaction.customId === "backup"){

interaction.reply({
content:"Backup sistemi placeholder (istersen sonra tam backup ekleriz).",
ephemeral:true
});

}

if(interaction.customId === "guardpanel"){

const row = new ActionRowBuilder().addComponents(

new ButtonBuilder()
.setCustomId("channel")
.setLabel(`Kanal Guard ${guard.channel ? "✅" : "❌"}`)
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("role")
.setLabel(`Rol Guard ${guard.role ? "✅" : "❌"}`)
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("kick")
.setLabel(`Kick Guard ${guard.kick ? "✅" : "❌"}`)
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("ban")
.setLabel(`Ban Guard ${guard.ban ? "✅" : "❌"}`)
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("bot")
.setLabel(`Bot Guard ${guard.bot ? "✅" : "❌"}`)
.setStyle(ButtonStyle.Primary)

);

interaction.update({
embeds:[
new EmbedBuilder()
.setTitle("Guard Ayarları")
.setDescription("Guardları açıp kapatabilirsin")
],
components:[row]
});

}

if(["channel","role","kick","ban","bot"].includes(interaction.customId)){

guard[interaction.customId] = !guard[interaction.customId];

interaction.reply({
content:`${interaction.customId} guard artık ${guard[interaction.customId] ? "AÇIK" : "KAPALI"}`,
ephemeral:true
});

}

});

client.on(Events.ChannelCreate, async channel=>{

if(!guard.channel) return;

const entry = (await channel.guild.fetchAuditLogs({
type:AuditLogEvent.ChannelCreate
})).entries.first();

if(!entry) return;

const user = entry.executor;

if(whitelist.includes(user.id)) return;

const member = channel.guild.members.cache.get(user.id);

if(member) await member.roles.set([]);

await channel.delete().catch(()=>{});

log(channel.guild,`🚨 Yetkisiz kanal açıldı ${user.tag}`);

});

client.on(Events.RoleCreate, async role=>{

if(!guard.role) return;

const entry = (await role.guild.fetchAuditLogs({
type:AuditLogEvent.RoleCreate
})).entries.first();

if(!entry) return;

const user = entry.executor;

if(whitelist.includes(user.id)) return;

const member = role.guild.members.cache.get(user.id);

if(member) await member.roles.set([]);

await role.delete().catch(()=>{});

log(role.guild,`🚨 Yetkisiz rol açıldı ${user.tag}`);

});

client.on(Events.GuildMemberRemove, async member=>{

if(!guard.kick) return;

const entry = (await member.guild.fetchAuditLogs({
type:AuditLogEvent.MemberKick
})).entries.first();

if(!entry) return;

const user = entry.executor;

if(whitelist.includes(user.id)) return;

const m = member.guild.members.cache.get(user.id);

if(m) m.roles.set([]);

log(member.guild,`🚨 Yetkisiz kick ${user.tag}`);

});

client.on(Events.GuildBanAdd, async ban=>{

if(!guard.ban) return;

const entry = (await ban.guild.fetchAuditLogs({
type:AuditLogEvent.MemberBanAdd
})).entries.first();

if(!entry) return;

const user = entry.executor;

if(whitelist.includes(user.id)) return;

await ban.guild.members.unban(ban.user.id).catch(()=>{});

const m = ban.guild.members.cache.get(user.id);

if(m) m.roles.set([]);

log(ban.guild,`🚨 Yetkisiz ban ${user.tag}`);

});

client.on(Events.GuildMemberAdd, async member=>{

if(!guard.bot) return;

if(!member.user.bot) return;

const entry = (await member.guild.fetchAuditLogs({
type:AuditLogEvent.BotAdd
})).entries.first();

if(!entry) return;

const user = entry.executor;

if(whitelist.includes(user.id)) return;

await member.ban().catch(()=>{});

const m = member.guild.members.cache.get(user.id);

if(m) m.roles.set([]);

log(member.guild,`🚨 Yetkisiz bot eklendi ${user.tag}`);

});

client.login(TOKEN);
