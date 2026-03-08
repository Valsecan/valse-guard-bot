const fs = require("fs");

module.exports = (client) => {

  // Guard ayarlarının doğru çalışabilmesi için
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const guards = JSON.parse(fs.readFileSync("./database/guards.json"));
    if (!guards.roleGuard) return;  // Eğer rol guard'ı kapalıysa işlemi durdur

    // Kullanıcı yeni bir rol eklediyse:
    if (oldMember.roles.cache.size >= newMember.roles.cache.size) return;

    const addedRole = newMember.roles.cache.find(r => !oldMember.roles.cache.has(r.id));
    if (!addedRole) return;  // Yeni rol eklenmemişse işlemi durdur

    // Whitelist kontrolü
    const whitelist = JSON.parse(fs.readFileSync("./database/whitelist.json"));
    if (whitelist.users.includes(newMember.id)) return;  // Eğer kullanıcı whitelist'te ise işlemi durdur

    try {
      await newMember.roles.remove(addedRole.id);  // Yetkisiz rol eklendiyse onu kaldır
    } catch (error) {
      console.error("Rol kaldırma hatası:", error);
    }
  });
};
