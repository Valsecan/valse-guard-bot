const fs = require("fs")

module.exports = (client)=>{

client.whitelistAdd = (id)=>{

const data = JSON.parse(fs.readFileSync("./database/whitelist.json"))

if(!data.users.includes(id)){
data.users.push(id)
fs.writeFileSync("./database/whitelist.json", JSON.stringify(data,null,2))
}

}

client.whitelistRemove = (id)=>{

const data = JSON.parse(fs.readFileSync("./database/whitelist.json"))

data.users = data.users.filter(x=>x !== id)

fs.writeFileSync("./database/whitelist.json", JSON.stringify(data,null,2))

}

  }
