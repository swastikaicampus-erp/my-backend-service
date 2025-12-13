// models/Playlist.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const playlistSchema = new Schema({
    // 1. Playlist Name (एडमिन के लिए पहचान)
    name: {
        type: String,
        required: [true, 'Playlist name is required.'],
        trim: true,
        unique: true
    },
    
    // 2. NEW FIELD: केवल एक प्लेलिस्ट एक समय में सक्रिय हो सकती है
    isActive: { 
        type: Boolean, 
        default: false 
    }, 
    
    // 3. Ads Array (इस प्लेलिस्ट में कौन-कौन से विज्ञापन शामिल हैं)
    ads: [{
        type: Schema.Types.ObjectId,
        ref: 'Ad',
        required: true
    }],
    
    // 4. Metadata
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Playlist', playlistSchema);