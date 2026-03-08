import { SlashCommandBuilder } from 'discord.js';
export default {
    data: new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Kullanıcıyı whitelist\'e ekler veya çıkarır')
        .addUserOption(option => option.setName('kullanici').setDescription('Kullanıcı seç')),
    async execute(interaction){
        const user = interaction.options.getUser('kullanici');
        if(!user) return interaction.reply('Geçersiz işlem!');
        // whitelist ekle/kaldır
        await interaction.reply(`${user.tag} whitelist güncellendi!`);
    }
};
