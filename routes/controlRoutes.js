const express = require('express');
const Device = require('../models/Device');

module.exports = (io) => {
    const router = express.Router();

    // PUT /api/control/TV_Display_1 - डिवाइस की स्थिति अपडेट करें
    router.put('/:deviceId', async (req, res) => {
        const { deviceId } = req.params;
        const { volume, isPlaying } = req.body;

        try {
            const device = await Device.findOneAndUpdate(
                { deviceId },
                { $set: { volume, isPlaying, lastUpdated: new Date() } },
                { upsert: true, new: true } // upsert: if not exists, create
            );

            // Socket.IO Real-Time Update
            io.to(deviceId).emit('control-update', { volume: device.volume, isPlaying: device.isPlaying });
            // Note: Display App को कनेक्ट होने पर io.join(deviceId) करना होगा

            res.json(device);
        } catch (error) {
            res.status(500).json({ message: 'Control update failed.' });
        }
    });

    return router;
};