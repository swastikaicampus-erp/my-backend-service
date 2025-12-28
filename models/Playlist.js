const mongoose = require('mongoose');

const PlaylistSchema = new mongoose.Schema({
    // इस फील्ड से पता चलेगा कि प्लेलिस्ट किस यूजर की है
    userId: { type: String, required: true, index: true },
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

// इंडेक्सिंग: एक यूजर अपने अकाउंट में सेम नाम की दो प्लेलिस्ट नहीं रख पाएगा, 
// लेकिन अलग-अलग यूजर्स सेम नाम रख सकते हैं।
PlaylistSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Playlist', PlaylistSchema);