import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('yardim')
  .setDescription('Komutları ve ne işe yaradıklarını gösterir');

export async function execute(interaction) {
  await interaction.reply(`
**/yardim** - Komutları gösterir
**/whitelist** - Dokunulmazları ayarla
**/settings** - Guardları aç/kapat
  `);
}
