// index.js (ES Module)
import { Client, GatewayIntentBits, Events, AuditLogEvent } from 'discord.js';
import express from 'express';
import 'dotenv/config';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages
  ]
});

// Express web server (Railway için)
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// Guard ve backup
let backupChannels = {};
let backupRoles = {};
let whitelist = [];

client.once(Events.ClientReady, async () => {
  console.log(`Bot açıldı: ${client.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  client.logChannel = await guild.channels.fetch(process.env.LOG_CHANNEL_ID);

  // Kanal backup
  const channels = await guild.channels.fetch();
  channels.forEach(ch => {
    backupChannels[ch.id] = { name: ch.name, type: ch.type, parentId: ch.parentId };
  });

  // Rol backup
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

  console.log("Guard sistemi aktif ve yedekler hazır");
});

// Örnek guard: Kanal silme
client.on(Events.ChannelDelete, async channel => {
  const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
  const entry = audit.entries.first();
  if (!entry) return;
  if (whitelist.includes(entry.executor.id)) return;

  await channel.guild.channels.create({
    name: backupChannels[channel.id].name,
    type: backupChannels[channel.id].type,
    parent: backupChannels[channel.id].parentId
  });

  if (client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${backupChannels[channel.id].name}`);
});

client.login(process.env.DISCORD_TOKEN);
