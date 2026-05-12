const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images are allowed (jpeg, jpg, png, gif, webp).'));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 } });

// POST /api/upload
router.post('/', protect, upload.array('images', 10), asyncHandler(async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded.' });
  const urls = req.files.map(f => `/uploads/${f.filename}`);
  res.json({ urls });
}));

// DELETE /api/upload
router.delete('/', protect, asyncHandler(async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ message: 'Filename required.' });
  const filePath = path.join(uploadDir, path.basename(filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ message: 'File deleted.' });
}));

module.exports = router;
