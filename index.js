const { Client, GatewayIntentBits } = require("discord.js")
const express = require("express")

const client = new Client({
 intents:[
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildModeration
 ]
})

// web server (railway için)
const app = express()
app.get("/",(req,res)=>res.send("Bot aktif"))
app.listen(8080,()=>console.log("Web server 8080 portunda açık"))

require("./systems/panel")(client)
require("./systems/guard")(client)
require("./systems/backup")(client)
require("./systems/whitelist")(client)

client.once("ready",()=>{
 console.log(`Bot açıldı: ${client.user.tag}`)
})

client.login(process.env.TOKEN)
