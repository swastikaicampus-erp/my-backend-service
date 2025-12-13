const mongoose = require('mongoose');

const AdSchema = new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true }, // Cloudinary URL
    public_id: { type: String }, // Cloudinary Public ID (Delete करने के लिए जरूरी)
    type: { type: String, enum: ['image', 'video'], required: true },
    order: { type: Number, default: 0 },
    duration: { type: Number, default: 10 }, // सेकंड में
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Ad', AdSchema);