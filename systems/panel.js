const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require("discord.js")
const fs = require("fs")

module.exports = (client) => {

client.once("ready", async () => {

const command = new SlashCommandBuilder()
.setName("panel")
.setDescription("Guard panelini açar")

await client.application.commands.create(command)

})

client.on(Events.InteractionCreate, async interaction => {

if(!interaction.isChatInputCommand()) return
if(interaction.commandName !== "panel") return

const whitelist = JSON.parse(fs.readFileSync("./database/whitelist.json"))

if(!whitelist.users.includes(interaction.user.id))
return interaction.reply({content:"Whitelist değilsin", ephemeral:true})

const guards = JSON.parse(fs.readFileSync("./database/guards.json"))

const embed = new EmbedBuilder()
.setTitle("🛡 ATHENA GUARD PANEL")
.setDescription(`
Rol Guard: ${guards.roleGuard ? "✅" : "❌"}
Kanal Guard: ${guards.channelGuard ? "✅" : "❌"}
Kick Guard: ${guards.kickGuard ? "✅" : "❌"}
Ban Guard: ${guards.banGuard ? "✅" : "❌"}
Bot Guard: ${guards.botGuard ? "✅" : "❌"}
Webhook Guard: ${guards.webhookGuard ? "✅" : "❌"}
Emoji Guard: ${guards.emojiGuard ? "✅" : "❌"}
`)

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("guardayar").setLabel("Guard Ayarları").setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("backup").setLabel("Backup").setStyle(ButtonStyle.Success)
)

interaction.reply({embeds:[embed],components:[row]})

})

  }
