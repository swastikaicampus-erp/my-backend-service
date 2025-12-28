const mongoose = require('mongoose');

const AdSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // <--- यह लाइन जोड़ें
    title: { type: String, required: true },
    url: { type: String, required: true },
    public_id: { type: String },
    type: { type: String, enum: ['image', 'video'], required: true },
    order: { type: Number, default: 0 },
    duration: { type: Number, default: 10 },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Ad', AdSchema);