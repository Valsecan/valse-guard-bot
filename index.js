const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ],
  partials: ['GUILD_MEMBER', 'CHANNEL', 'MESSAGE', 'REACTION', 'USER'] // partials ekliyoruz
});

client.once("clientReady", () => {
  console.log(`Bot açıldı: ${client.user.tag}`);
});

client.login(process.env.TOKEN); // token'ı environment variable'dan alıyoruz

require("./systems/panel")(client); // Panel.js dosyasını dahil ediyoruz
require("./systems/guard")(client); // Guard sistemini dahil ediyoruz
require("./systems/backup")(client); // Backup sistemini dahil ediyoruz
require("./systems/whitelist")(client); // Whitelist sistemini dahil ediyoruz

// Web server (Railway için)
const app = express();
app.get("/", (req, res) => res.send("Bot aktif"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));
