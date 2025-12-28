const mongoose = require('mongoose');

const PlaylistSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    ads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ad' }],
    isActive: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Unique Index (User specific)
PlaylistSchema.index({ userId: 1, name: 1 }, { unique: true });

const Playlist = mongoose.model('Playlist', PlaylistSchema);

// Old Index Cleanup: यह पुराने deviceId एरर को खत्म करेगा
Playlist.collection.dropIndex('deviceId_1').catch(() => {
    // अगर इंडेक्स नहीं मिलता तो कोई बात नहीं
});

module.exports = Playlist;