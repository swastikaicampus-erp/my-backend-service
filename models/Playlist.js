const mongoose = require('mongoose');

const PlaylistSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    ads: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ad'
    }],
    isActive: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// इंडेक्स: एक यूजर एक ही नाम की दो प्लेलिस्ट नहीं बना पाएगा
PlaylistSchema.index({ userId: 1, name: 1 }, { unique: true });

const Playlist = mongoose.model('Playlist', PlaylistSchema);

// --- पुराना 'deviceId' इंडेक्स हटाने का जादुई कोड ---
Playlist.collection.dropIndex('deviceId_1').catch(err => {
    // अगर इंडेक्स पहले से डिलीटेड है, तो कोई एरर नहीं आएगी
    console.log("Old deviceId index cleaned or not found.");
});

module.exports = Playlist;