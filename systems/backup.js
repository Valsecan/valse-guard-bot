const fs = require("fs")

module.exports = (client)=>{

client.once("ready", async ()=>{

const guild = client.guilds.cache.first()

const roles = guild.roles.cache.map(r=>({
name:r.name,
color:r.color,
permissions:r.permissions.bitfield
}))

fs.writeFileSync("./database/backup.json", JSON.stringify(roles,null,2))

console.log("Rol backup alındı")

})

}
