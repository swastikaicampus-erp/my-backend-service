// routes/playlistRoutes.js
const express = require('express');
const { protect } = require('../middleware/authMiddleware'); // सुनिश्चित करें कि यह पाथ सही है
const Playlist = require('../models/Playlist');
const Ad = require('../models/Ad'); 

module.exports = (io) => { 
    const router = express.Router();

    // पॉपुलेशन विकल्प (Ads को उनके 'order' फ़ील्ड के अनुसार सॉर्ट करने के लिए)
    const adPopulateOptions = {
        path: 'ads',
        options: { sort: { 'order': 1 } }
    };

    // =======================================================
    // 1. ADMIN ROUTES (PROTECTED) - CRUD Operations
    // =======================================================

    // GET /api/playlists - सभी प्लेलिस्ट सूचीबद्ध करें (एडमिन)
    router.get('/', protect, async (req, res) => {
        try {
            const playlists = await Playlist.find()
                .populate(adPopulateOptions) 
                .sort({ createdAt: -1 });
            res.json(playlists);
        } catch (error) {
            console.error("GET Playlists Error:", error);
            res.status(500).json({ message: 'Failed to fetch playlists.' });
        }
    });

    // POST /api/playlists - नई प्लेलिस्ट बनाएँ (एडमिन)
    router.post('/', protect, async (req, res) => {
        const { name, adIds } = req.body;
        
        if (!name || !adIds || adIds.length === 0) {
            return res.status(400).json({ message: 'Please provide name and adIds.' });
        }

        try {
            const newPlaylist = new Playlist({
                name,
                ads: adIds 
            });

            const savedPlaylist = await newPlaylist.save();
            const populatedPlaylist = await savedPlaylist.populate(adPopulateOptions);
            
            io.emit('playlist-created', populatedPlaylist._id); 
            
            res.status(201).json(populatedPlaylist);

        } catch (error) {
            console.error("POST Playlist Error:", error);
            if (error.code === 11000) {
                 return res.status(400).json({ message: 'Playlist name must be unique.' });
            }
            res.status(400).json({ message: 'Error creating playlist: ' + error.message });
        }
    });

    // PUT /api/playlists/:id - मौजूदा प्लेलिस्ट अपडेट करें (एडमिन)
    router.put('/:id', protect, async (req, res) => {
        const { name, adIds } = req.body;
        
        try {
            const playlist = await Playlist.findById(req.params.id);
            if (!playlist) {
                return res.status(404).json({ message: 'Playlist not found.' });
            }
            
            if (name !== undefined) playlist.name = name;
            if (adIds !== undefined) playlist.ads = adIds;

            const updatedPlaylist = await playlist.save();
            
            // यदि अपडेट की गई प्लेलिस्ट सक्रिय थी, तो क्लाइंट को सूचित करें
            if (updatedPlaylist.isActive) {
                 io.emit('active-playlist-updated', updatedPlaylist._id); 
            } else {
                 io.emit('playlist-updated', updatedPlaylist._id); 
            }
            
            const populatedPlaylist = await updatedPlaylist.populate(adPopulateOptions);
            
            res.json(populatedPlaylist);

        } catch (error) {
            console.error("PUT Playlist Error:", error);
             if (error.code === 11000) {
                 return res.status(400).json({ message: 'Playlist name must be unique.' });
            }
            res.status(400).json({ message: 'Error updating playlist: ' + error.message });
        }
    });

    // DELETE /api/playlists/:id - प्लेलिस्ट डिलीट करें (एडमिन)
    router.delete('/:id', protect, async (req, res) => {
        try {
            const playlist = await Playlist.findByIdAndDelete(req.params.id);
            if (!playlist) {
                return res.status(404).json({ message: 'Playlist not found.' });
            }
            
            // सक्रिय या निष्क्रिय सभी क्लाइंट को सूचित करें
            io.emit('playlist-deleted', playlist._id); 
            // यदि सक्रिय प्लेलिस्ट डिलीट हुई, तो क्लाइंट को फिर से फ़ेच करने के लिए प्रेरित करें
            if (playlist.isActive) {
                 io.emit('active-playlist-updated', null); 
            }
            
            res.json({ message: 'Playlist deleted successfully.' });
        } catch (error) {
            console.error("DELETE Playlist Error:", error);
            res.status(500).json({ message: 'Error deleting playlist.' });
        }
    });
    
    // =======================================================
    // 2. NEW: ACTIVATE Playlist Route (Protected)
    // =======================================================
    // PUT /api/playlists/activate/:id - इस प्लेलिस्ट को सक्रिय करें
    router.put('/activate/:id', protect, async (req, res) => {
        try {
            const playlistId = req.params.id;
            
            // 1. सभी मौजूदा सक्रिय प्लेलिस्ट को निष्क्रिय (deactivate) करें
            await Playlist.updateMany({ isActive: true }, { $set: { isActive: false } });

            // 2. इस विशिष्ट प्लेलिस्ट को सक्रिय करें
            const activePlaylist = await Playlist.findByIdAndUpdate(
                playlistId,
                { isActive: true },
                { new: true } 
            );

            if (!activePlaylist) {
                return res.status(404).json({ message: 'Playlist not found.' });
            }

            // Socket.IO: सभी क्लाइंट को सूचित करें कि Active Playlist बदल गई है
            io.emit('active-playlist-updated', activePlaylist._id); 

            res.json({ message: 'Playlist activated successfully.', playlist: activePlaylist });
        } catch (error) {
            console.error("Activate Playlist Error:", error);
            res.status(500).json({ message: 'Error activating playlist.' });
        }
    });

    // =======================================================
    // 3. PUBLIC ROUTE - Get the CURRENT ACTIVE Playlist (Client Display)
    // =======================================================
    
    // GET /api/playlists/active - सक्रिय प्लेलिस्ट के Ads फ़ेच करें
    router.get('/active', async (req, res) => {
        try {
            const playlist = await Playlist.findOne({ isActive: true })
                .populate(adPopulateOptions);

            if (!playlist) {
                // यदि कोई प्लेलिस्ट सक्रिय नहीं है
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
            res.status(500).json({ message: 'Internal server error while fetching active playlist.' });
        }
    });

    return router;
};