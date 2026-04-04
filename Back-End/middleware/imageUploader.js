const multer = require("multer");
const path = require("path");
const fs = require("fs");

const imageFolder = path.join(__dirname, "../public_html/uploads");
if (!fs.existsSync(imageFolder)) fs.mkdirSync(imageFolder, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imageFolder),
    filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
});

const fileFilter = (req, file, cb) => {
    const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".jfif"];
    if (allowedExts.includes(path.extname(file.originalname).toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed"), false);
    }
};

const uploadImage = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = uploadImage;