import { SlashCommandBuilder } from 'discord.js';
export default {
    data: new SlashCommandBuilder()
        .setName('yardim')
        .setDescription('Komutları ve açıklamalarını gösterir'),
    async execute(interaction){
        await interaction.reply(`
/yardim - Komutları gösterir
/whitelist - Dokunulmaz kullanıcı ekle/kaldır
/settings - Guard ayarlarını aç/kapa
        `);
    }
};
