import { SlashCommandBuilder } from 'discord.js';
export default {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Guard ayarlarını aç/kapa')
        .addStringOption(option => option.setName('guard').setDescription('Aç/kapa: kanal, rol, üye')),
    async execute(interaction){
        if(interaction.user.id !== process.env.BOT_OWNER_ID) return interaction.reply('Geçersiz guard!');
        await interaction.reply('Guard ayarı güncellendi!');
    }
};
