const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true }, // जैसे 'TV_Display_1'
    volume: { type: Number, default: 50, min: 0, max: 100 },
    isPlaying: { type: Boolean, default: true },
    lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Device', DeviceSchema);