const fs = require("fs")

module.exports = (client)=>{

client.once("ready", async ()=>{

const guild = client.guilds.cache.first()
if(!guild) return

const roles = guild.roles.cache
.filter(r => r.name !== "@everyone")
.map(r => ({
name: r.name,
color: r.color,
permissions: r.permissions.bitfield.toString(), // BIGINT FIX
position: r.position
}))

fs.writeFileSync("./database/backup.json", JSON.stringify(roles,null,2))

console.log("Rol backup alındı")

})

  }
