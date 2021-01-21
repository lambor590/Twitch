const Discord = require('discord.js');
const moment = require('moment');
const humanizeDuration = require("humanize-duration");
const config = require('./config.json');

class LiveEmbed {
  static createForStream(streamData) {
    const isLive = streamData.type === "live";
    const allowBoxArt = config.twitch_use_boxart;

    let msgEmbed = new Discord.MessageEmbed();
    msgEmbed.setColor(isLive ? "#9146ff" : "GREY");
    msgEmbed.setURL(`https://twitch.tv/${streamData.user_name.toLowerCase()}`);

    // Thumbnail
    let thumbUrl = streamData.profile_image_url;

    if (allowBoxArt && streamData.game && streamData.game.box_art_url) {
      thumbUrl = streamData.game.box_art_url;
      thumbUrl = thumbUrl.replace("{width}", "288");
      thumbUrl = thumbUrl.replace("{height}", "384");
    }

    msgEmbed.setThumbnail(thumbUrl);

    if (isLive) {
      // Title
      msgEmbed.setTitle(`:red_circle: **¡${streamData.user_name} está ahora emitiendo en Twitch!**`);
      msgEmbed.addField("Título del directo:", streamData.title, false);
    } else {
      msgEmbed.setTitle(`:white_circle: ${streamData.user_name} estaba emitiendo en Twitch.`);
      msgEmbed.setDescription('El directo ha terminado.');

      msgEmbed.addField("Título", streamData.title, true);
    }

    
    if (isLive) {
      // Add status
      msgEmbed.addField("Estado:", isLive ? `Con ${streamData.viewer_count} espectadores` : 'El directo ha terminado', true);

      // Set main image (stream preview)
      let imageUrl = streamData.thumbnail_url;
      imageUrl = imageUrl.replace("{width}", "1280");
      imageUrl = imageUrl.replace("{height}", "720");
      let thumbnailBuster = (Date.now() / 1000).toFixed(0);
      imageUrl += `?t=${thumbnailBuster}`;
      msgEmbed.setImage(imageUrl);

      // Add uptime
      let now = moment();
      let startedAt = moment(streamData.started_at);

      msgEmbed.addField("Lleva en directo:", humanizeDuration(now - startedAt, {
        delimiter: ", ",
        language: "es",
        largest: 2,
        round: true,
        units: ["y", "mo", "w", "d", "h", "m"]
      }), true);
    }

    return msgEmbed;
  }
}

module.exports = LiveEmbed;