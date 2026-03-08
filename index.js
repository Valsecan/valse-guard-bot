const { Client, GatewayIntentBits, Collection } = require("discord.js")
const fs = require("fs")
const express = require("express")
const config = require("./config.json")

const client = new Client({
 intents:[
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMessages
 ]
})

client.commands = new Collection()

// web server
const app = express()
app.get("/",(req,res)=>res.send("ATHENA GUARD aktif"))
app.listen(8080,()=>console.log("Web server çalışıyor"))

// sistemleri yükle
require("./systems/panel")(client)
require("./systems/guard")(client)
require("./systems/backup")(client)
require("./systems/whitelist")(client)

client.once("ready",()=>{
 console.log(`Bot aktif: ${client.user.tag}`)
})

client.login(config.token)
