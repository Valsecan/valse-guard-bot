import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Guardları aç/kapat')
  .addStringOption(option =>
    option.setName('guard')
      .setDescription('Hangi guard? kanal/rol/üye')
      .setRequired(true))
  .addBooleanOption(option =>
    option.setName('durum')
      .setDescription('Aç/kapat')
      .setRequired(true));

export async function execute(interaction) {
  const guard = interaction.options.getString('guard');
  const durum = interaction.options.getBoolean('durum');
  await interaction.reply(`${guard} guard ${durum ? 'açıldı' : 'kapatıldı'}`);
    }
