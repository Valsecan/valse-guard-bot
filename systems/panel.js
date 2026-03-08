const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");

module.exports = (client) => {

  // Slash komutu tanımlıyoruz
  client.once("ready", async () => {
    console.log(`Bot aktif: ${client.user.tag}`);

    // Burada '/panel' komutunu Discord'a kaydediyoruz
    const command = {
      name: 'panel',
      description: 'Guard panelini açar'
    };
    await client.application.commands.create(command);
  });

  // Interaction event’i
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return; // sadece butonları dinleriz

    await interaction.deferUpdate(); // buton etkileşimini "işleniyor" olarak işaretle

    if (interaction.customId === "guardayar") {
      // Guard Ayarları işlemi
      await interaction.editReply("Guard ayarları açıldı!");
    } else if (interaction.customId === "whitelist") {
      // Whitelist işlemi
      await interaction.editReply("Whitelist paneli açıldı!");
    } else if (interaction.customId === "backup") {
      // Backup işlemi
      await interaction.editReply("Backup işlemi açıldı!");
    }
  });

  client.on("messageCreate", async (message) => {
    if (message.content === "/panel") {
      const embed = new EmbedBuilder()
        .setTitle("🛡 ATHENA GUARD PANEL")
        .setDescription(`
          **Guard Ayarları**: Rol Guard, Kanal Guard, Kick Guard, vb.
          **Whitelist**: Whitelist kişileri
          **Backup**: Backup işlemleri
        `);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("guardayar").setLabel("Guard Ayarları").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("whitelist").setLabel("Whitelist").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("backup").setLabel("Backup").setStyle(ButtonStyle.Success)
      );

      message.channel.send({ embeds: [embed], components: [row] });
    }
  });

};
