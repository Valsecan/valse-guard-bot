const { Client, GatewayIntentBits, Partials, Events, AuditLogEvent, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const BOT_OWNER_ID = process.env.BOT_OWNER_ID; // Tek kişilik bot sahibi

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
    ],
    partials: [Partials.Channel, Partials.GuildMember]
});

// ===== Web server (Railway uyumlu) =====
const app = express();
app.get("/", (req, res) => res.send("Guard bot aktif"));
app.listen(8080, () => console.log("Web server 8080 portunda açık"));

// ===== Guard Yedekleri =====
let backupChannels = {};
let backupRoles = {};
let whitelist = [];
let settings = {
    kanalGuard: true,
    rolGuard: true,
    uyeGuard: true,
    banGuard: true,
    kickGuard: true,
    botGuard: true
};

// ===== Helper: Cezalandırma =====
async function punish(guild, userId, reason) {
    if (whitelist.includes(userId)) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (!member.manageable) return;
    await member.roles.set([]);
    if (client.logChannel) {
        client.logChannel.send(`🚨 ${member.user.tag} cezalandırıldı; sebep: ${reason}`);
    }
}

// ===== Bot Ready =====
client.once(Events.ClientReady, async () => {
    console.log(`Bot açıldı: ${client.user.tag}`);
    const guild = await client.guilds.fetch(GUILD_ID);
    client.logChannel = await guild.channels.fetch(LOG_CHANNEL_ID);

    // Kanalları yedekle
    const channels = await guild.channels.fetch();
    channels.forEach(ch => {
        backupChannels[ch.id] = {
            name: ch.name,
            type: ch.type,
            parentId: ch.parentId,
            permissionOverwrites: ch.permissionOverwrites.cache.map(p => ({
                id: p.id,
                allow: p.allow.bitfield,
                deny: p.deny.bitfield
            }))
        };
    });

    // Rolleri yedekle
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
    if (client.logChannel) client.logChannel.send("Guard sistemi aktif ve yedekler hazır");
});

// ===== Kanal Guard =====
client.on(Events.ChannelDelete, async channel => {
    if (!settings.kanalGuard) return;
    const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
    const executor = audit.entries.first()?.executor;
    if (executor) await punish(channel.guild, executor.id, "kanal silme");

    const data = backupChannels[channel.id];
    if (data) {
        await channel.guild.channels.create({
            name: data.name,
            type: data.type,
            parent: data.parentId
        });
        if(client.logChannel) client.logChannel.send(`🟢 Kanal geri oluşturuldu: ${data.name}`);
    }
});

client.on(Events.ChannelCreate, async channel => {
    if (!settings.kanalGuard) return;
    const audit = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
    const executor = audit.entries.first()?.executor;
    if (executor) await punish(channel.guild, executor.id, "kanal açma");
});

// ===== Rol Guard =====
client.on(Events.RoleDelete, async role => {
    if (!settings.rolGuard) return;
    const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
    const executor = audit.entries.first()?.executor;
    if (executor) await punish(role.guild, executor.id, "rol silme");

    const data = backupRoles[role.id];
    if (data) {
        await role.guild.roles.create({
            name: data.name,
            color: data.color,
            permissions: BigInt(data.permissions),
            hoist: data.hoist,
            mentionable: data.mentionable
        });
        if(client.logChannel) client.logChannel.send(`🟢 Rol geri oluşturuldu: ${data.name}`);
    }
});

client.on(Events.RoleCreate, async role => {
    if (!settings.rolGuard) return;
    const audit = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
    const executor = audit.entries.first()?.executor;
    if (executor) await punish(role.guild, executor.id, "rol oluşturma");
});

// ===== Üye Guard =====
client.on(Events.GuildMemberRemove, async member => {
    if (!settings.uyeGuard) return;
    const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
    const executor = audit.entries.first()?.executor;
    if (executor) await punish(member.guild, executor.id, "kick atma");
});

client.on(Events.GuildBanAdd, async ban => {
    if (!settings.banGuard) return;
    const audit = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
    const executor = audit.entries.first()?.executor;
    if (executor) await punish(ban.guild, executor.id, "ban atma");
});

// ===== Bot ekleme guard =====
client.on(Events.GuildMemberAdd, async member => {
    if (!settings.botGuard) return;
    if (!member.user.bot) return;
    const audit = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 });
    const executor = audit.entries.first()?.executor;
    if (executor) await punish(member.guild, executor.id, "bot ekleme");
    await member.kick();
});

// ===== Komutlar =====
const commands = [
    new SlashCommandBuilder().setName("yardim").setDescription("Komutları ve ne işe yaradıklarını gösterir"),
    new SlashCommandBuilder().setName("whitelist").setDescription("Whitelist sistemini yönetir")
        .addUserOption(option => option.setName("kullanici").setDescription("Kullanıcı").setRequired(true))
        .addStringOption(option => option.setName("islem").setDescription("ekle veya kaldir").setRequired(true)),
    new SlashCommandBuilder().setName("settings").setDescription("Guard ayarlarını aç/kapa")
        .addStringOption(option => option.setName("guard").setDescription("guard türü").setRequired(true))
        .addBooleanOption(option => option.setName("durum").setDescription("aç/kapa").setRequired(true))
];

// Deploy slash komutları
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
    try {
        console.log("Slash komutları deploy ediliyor...");
        await rest.put(
            Routes.applicationGuildCommands(BOT_OWNER_ID, GUILD_ID),
            { body: commands }
        );
        console.log("Slash komutları yüklendi.");
    } catch (e) {
        console.error(e);
    }
})();

// ===== Komut çalıştırma =====
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    // BOT sahibi ve yönetici yetkisi kontrolü
    const member = interaction.member;
    if (interaction.user.id !== BOT_OWNER_ID && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "❌ Komutu kullanmak için yetkin yok.", ephemeral: true });
    }

    if (commandName === "yardim") {
        interaction.reply({
            content: "/yardim - Komutları gösterir\n/whitelist - Kullanıcı ekle/kaldir\n/settings - Guard aç/kapa",
            ephemeral: true
        });
    } else if (commandName === "whitelist") {
        const user = interaction.options.getUser("kullanici");
        const islem = interaction.options.getString("islem").toLowerCase();

        if (islem === "ekle") {
            if (!whitelist.includes(user.id)) whitelist.push(user.id);
            interaction.reply({ content: `✅ ${user.tag} whitelist'e eklendi.`, ephemeral: true });
        } else if (islem === "kaldir") {
            whitelist = whitelist.filter(u => u !== user.id);
            interaction.reply({ content: `✅ ${user.tag} whitelist'ten kaldırıldı.`, ephemeral: true });
        } else {
            interaction.reply({ content: "❌ Geçersiz işlem! ekle veya kaldir kullanın.", ephemeral: true });
        }
    } else if (commandName === "settings") {
        const guard = interaction.options.getString("guard");
        const durum = interaction.options.getBoolean("durum");
        if (settings.hasOwnProperty(guard)) {
            settings[guard] = durum;
            interaction.reply({ content: `✅ ${guard} guard ${durum ? "aktif" : "pasif"} edildi.`, ephemeral: true });
        } else {
            interaction.reply({ content: "❌ Geçersiz guard türü!", ephemeral: true });
        }
    }
});

client.login(TOKEN);
