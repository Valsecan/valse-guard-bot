const fs = require("fs")

module.exports = (client)=>{

client.on("guildMemberUpdate", async (oldMember,newMember)=>{

const guards = JSON.parse(fs.readFileSync("./database/guards.json"))
if(!guards.roleGuard) return

if(oldMember.roles.cache.size >= newMember.roles.cache.size) return

const addedRole = newMember.roles.cache.find(r => !oldMember.roles.cache.has(r.id))
if(!addedRole) return

const whitelist = JSON.parse(fs.readFileSync("./database/whitelist.json"))
if(whitelist.users.includes(newMember.id)) return

try{
await newMember.roles.remove(addedRole.id)
}catch{}

})

}
