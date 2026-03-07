import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Birini whitelist\'e ekle/kaldır')
  .addUserOption(option =>
    option.setName('kisi')
      .setDescription('Whiteliste ekle/kaldır')
      .setRequired(true));

export async function execute(interaction) {
  const user = interaction.options.getUser('kisi');
  if (!user) return interaction.reply('Geçersiz kullanıcı');
  // whitelist dizisini güncelle
  await interaction.reply(`${user.tag} whitelist güncellendi`);
}
