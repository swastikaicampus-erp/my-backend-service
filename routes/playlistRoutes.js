const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const Playlist = require('../models/Playlist');
const Ad = require('../models/Ad');

module.exports = (io) => {
    const router = express.Router();

    // पॉपुलेशन विकल्प (सिर्फ उसी यूजर के Ads को सॉर्ट करके लाएगा)
    const adPopulateOptions = {
        path: 'ads',
        options: { sort: { 'order': 1 } }
    };

    // =======================================================
    // 1. ADMIN ROUTES (PROTECTED) - सिर्फ लॉगिन यूजर के लिए
    // =======================================================

    // GET /api/playlists - लॉगिन यूजर की अपनी सभी प्लेलिस्ट
    router.get('/', protect, async (req, res) => {
        try {
            const playlists = await Playlist.find({ userId: req.user.uid })
                .populate(adPopulateOptions)
                .sort({ createdAt: -1 });
            res.json(playlists);
        } catch (error) {
            console.error("GET Playlists Error:", error);
            res.status(500).json({ message: 'Failed to fetch playlists.' });
        }
    });

    // POST /api/playlists - नई प्लेलिस्ट बनाएँ
    router.post('/', protect, async (req, res) => {
        const { name, adIds } = req.body;

        if (!name || !adIds || adIds.length === 0) {
            return res.status(400).json({ message: 'Please provide name and adIds.' });
        }

        try {
            const newPlaylist = new Playlist({
                userId: req.user.uid, // <--- यूजर ID सेव करें
                name,
                ads: adIds
            });

            const savedPlaylist = await newPlaylist.save();
            const populatedPlaylist = await savedPlaylist.populate(adPopulateOptions);

            // सॉकेट को यूजर स्पेसिफिक आईडी के साथ भेजें
            io.emit(`playlist-created-${req.user.uid}`, populatedPlaylist._id);

            res.status(201).json(populatedPlaylist);
        } catch (error) {
            console.error("POST Playlist Error:", error);
            if (error.code === 11000) {
                return res.status(400).json({ message: 'Playlist name must be unique for your account.' });
            }
            res.status(400).json({ message: 'Error creating playlist: ' + error.message });
        }
    });

    // PUT /api/playlists/:id - अपनी प्लेलिस्ट अपडेट करें
    router.put('/:id', protect, async (req, res) => {
        const { name, adIds } = req.body;
        try {
            // चेक करें कि प्लेलिस्ट उसी यूजर की है
            const playlist = await Playlist.findOne({ _id: req.params.id, userId: req.user.uid });
            
            if (!playlist) return res.status(404).json({ message: 'Playlist not found or unauthorized.' });

            if (name !== undefined) playlist.name = name;
            if (adIds !== undefined) playlist.ads = adIds;

            const updatedPlaylist = await playlist.save();
            const populatedPlaylist = await updatedPlaylist.populate(adPopulateOptions);

            // अपडेट इवेंट भेजें
            io.emit(`playlist-updated-${req.user.uid}`, updatedPlaylist._id);

            res.json(populatedPlaylist);
        } catch (error) {
            res.status(400).json({ message: 'Update failed: ' + error.message });
        }
    });

    // DELETE /api/playlists/:id - अपनी प्लेलिस्ट डिलीट करें
    router.delete('/:id', protect, async (req, res) => {
        try {
            const playlist = await Playlist.findOneAndDelete({ _id: req.params.id, userId: req.user.uid });
            
            if (!playlist) return res.status(404).json({ message: 'Playlist not found or unauthorized.' });

            io.emit(`playlist-deleted-${req.user.uid}`, playlist._id);
            res.json({ message: 'Playlist deleted successfully.' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting playlist.' });
        }
    });

    // PUT /api/playlists/activate/:id - प्लेलिस्ट एक्टिवेट करें (Live करें)
    router.put('/activate/:id', protect, async (req, res) => {
        try {
            const playlistId = req.params.id;

            // 1. इस यूजर की सभी पुरानी प्लेलिस्ट को पहले डी-एक्टिवेट करें
            await Playlist.updateMany({ userId: req.user.uid, isActive: true }, { $set: { isActive: false } });

            // 2. अब सिर्फ इस यूजर की चुनी हुई प्लेलिस्ट को एक्टिव करें
            const activePlaylist = await Playlist.findOneAndUpdate(
                { _id: playlistId, userId: req.user.uid },
                { isActive: true },
                { new: true }
            );

            if (!activePlaylist) return res.status(404).json({ message: 'Playlist not found.' });

            // डिस्प्ले स्क्रीन को बताएं कि नया कंटेंट लाइव हो गया है
            io.emit(`active-playlist-updated-${req.user.uid}`, activePlaylist._id);

            res.json({ message: 'Playlist activated successfully.', playlist: activePlaylist });
        } catch (error) {
            res.status(500).json({ message: 'Error activating playlist.' });
        }
    });

    // =======================================================
    // 2. PUBLIC ROUTE - डिस्प्ले स्क्रीन के लिए (Client Display)
    // =======================================================
    
    // GET /api/playlists/active?userId=USER_ID_HERE
    router.get('/active', async (req, res) => {
        try {
            const { userId } = req.query; // यूआरएल से यूजर आईडी मिलेगी

            if (!userId) {
                return res.status(400).json({ message: 'User ID is required in query params (?userId=...)' });
            }

            const playlist = await Playlist.findOne({ userId: userId, isActive: true })
                .populate(adPopulateOptions);

            if (!playlist) {
                return res.status(200).json({ 
                    name: 'No Active Playlist', 
                    ads: [], 
                    playlistId: null 
                });
            }
            
            res.json({ 
                playlistId: playlist._id, 
                name: playlist.name, 
                ads: playlist.ads 
            });

        } catch (error) {
            console.error(`Error fetching active playlist:`, error);
            res.status(500).json({ message: 'Internal server error.' });
        }
    });

    return router;
};