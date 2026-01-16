const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

function gerarThumbnail(videoPath) {
  return new Promise((resolve, reject) => {
    const thumbPath = videoPath.replace(/\.[^/.]+$/, ".jpg");

    ffmpeg(videoPath)
      .screenshots({
        timestamps: ["1"],   // 1 segundo
        filename: path.basename(thumbPath),
        folder: path.dirname(videoPath),
        size: "600x600"
      })
      .on("end", () => resolve(thumbPath))
      .on("error", reject);
  });
}

module.exports = gerarThumbnail;
