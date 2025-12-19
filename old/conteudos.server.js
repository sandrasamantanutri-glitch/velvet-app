const multer = require("multer");
const path = require("path");
const fs = require("fs");

module.exports = function (app) {

  const BASE = path.join(__dirname, "uploads", "conteudos");

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const modelo = req.query.modelo;
      if (!modelo) return cb(new Error("Modelo ausente"));

      const dir = path.join(BASE, modelo);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + "_" + file.originalname);
    }
  });

  const upload = multer({ storage });

  // 🔥 UPLOAD
  app.post(
    "/api/conteudos/upload",
    upload.single("arquivo"),
    (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: "Arquivo ausente" });
      }

      res.json({
        sucesso: true,
        arquivo: req.file.filename
      });
    }
  );
};
