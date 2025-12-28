const express = require('express');
const { protect } = require('../middleware/authMiddleware'); // सुनिश्चित करें कि यह पाथ सही है
const Ad = require('../models/Ad');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const fs = require('fs'); // लोकल फाइल क्लीनअप के लिए

// Cloudinary Config (.env से लेगा)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer Setup (Disk Storage - फ़ाइल को 'uploads/' फ़ोल्डर में सेव करेगा)
const upload = multer({ dest: 'uploads/' });

module.exports = (io) => {
    const router = express.Router();

    // ----------------------------------------------------------------------
    // 1. READ (GET) - सभी ऐड प्राप्त करें
    // ----------------------------------------------------------------------
    router.get('/', protect, async (req, res) => {
        try {
            // आर्डर के हिसाब से सॉर्ट
            const ads = await Ad.find({ userId: req.user.uid }).sort({ order: 1 });
            res.json(ads);
        } catch (error) {
            console.error("GET Ads Error:", error);
            res.status(500).json({ message: 'Failed to fetch ads.' });
        }
    });

    // ----------------------------------------------------------------------
    // 2. CREATE (POST) - नया ऐड अपलोड करें (बेहतर आर्डर हैंडलिंग)
    // ----------------------------------------------------------------------
    router.post('/', protect, upload.single('file'), async (req, res) => {
        let filePath = req.file ? req.file.path : null; // लोकल फ़ाइल पाथ

        try {
            if (!req.file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }

            // --- 1. आर्डर निर्धारित करें ---
            let adOrder = parseInt(req.body.order);
            // यदि ऑर्डर नहीं दिया गया है या 0 है, तो सूची के अंत में जोड़ें
            if (isNaN(adOrder) || adOrder < 0) {
                const maxAd = await Ad.findOne().sort({ order: -1 });
                adOrder = maxAd ? maxAd.order + 1 : 0;
            }

            // --- 2. Cloudinary पर अपलोड करें ---
            const result = await cloudinary.uploader.upload(filePath, {
                resource_type: "auto",
                folder: "digital_signage"
            });

            // --- 3. लोकल फाइल डिलीट करें (Cleanup) ---
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                filePath = null; // पाथ को रीसेट करें
            }

            // --- 4. डेटाबेस में सेव करें ---
            const newAd = new Ad({
                userId: req.user.uid, // <--- टोकन से यूजर ID यहाँ डालें
                title: req.body.title,
                order: adOrder,
                url: result.secure_url,
                public_id: result.public_id,
                type: result.resource_type === 'video' ? 'video' : 'image',
                duration: req.body.duration || 10
            });

            const savedAd = await newAd.save();

            // --- 5. Socket.io से सभी स्क्रीन को अपडेट भेजें (ad-created) ---
            io.emit('ad-created', savedAd);

            res.status(201).json(savedAd);

        } catch (error) {
            console.error("Upload Error:", error);
            // सुनिश्चित करें कि असफल होने पर भी लोकल फाइल डिलीट हो जाए
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            res.status(500).json({ message: 'Upload failed due to server error.' });
        }
    });

    // ----------------------------------------------------------------------
    // 3. UPDATE (PUT) - ऐड को एडिट करें (ad-edited Event)
    // ----------------------------------------------------------------------
    router.put('/:id', protect, upload.single('file'), async (req, res) => {
        let filePath = req.file ? req.file.path : null;

        try {
            const ad = await Ad.findById(req.params.id);
            if (!ad) return res.status(404).json({ message: 'Ad not found' });

            let newUrl = ad.url;
            let newPublicId = ad.public_id;
            let newType = ad.type;

            // A. अगर नई फ़ाइल अपलोड की गई है
            if (req.file) {

                // 1. पुरानी फ़ाइल को Cloudinary से डिलीट करें
                if (ad.public_id) {
                    try {
                        await cloudinary.uploader.destroy(ad.public_id, {
                            resource_type: ad.type === 'video' ? 'video' : 'image'
                        });
                    } catch (cloudError) {
                        // Cloudinary डिलीट विफल होने पर भी DB अपडेट जारी रखें
                        console.warn("Cloudinary old file deletion failed:", cloudError.message);
                    }
                }

                // 2. नई फ़ाइल को Cloudinary पर अपलोड करें
                const result = await cloudinary.uploader.upload(filePath, {
                    resource_type: "auto",
                    folder: "digital_signage"
                });

                newUrl = result.secure_url;
                newPublicId = result.public_id;
                newType = result.resource_type === 'video' ? 'video' : 'image';
            }

            // B. लोकल क्लीनअप
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                filePath = null;
            }

            // C. डेटाबेस में अपडेट करें
            // req.body.title, req.body.order, req.body.duration को null/undefined की जाँच करके अपडेट करें
            if (req.body.title !== undefined) ad.title = req.body.title;
            if (req.body.order !== undefined) ad.order = req.body.order;
            if (req.body.duration !== undefined) ad.duration = req.body.duration;

            ad.url = newUrl;
            ad.public_id = newPublicId;
            ad.type = newType;

            const updatedAd = await ad.save();

            // D. Socket.io से सभी स्क्रीन को अपडेट भेजें (ad-edited)
            io.emit('ad-edited', updatedAd);

            res.json(updatedAd);

        } catch (error) {
            console.error("Update Error:", error);
            // असफल होने पर भी लोकल फाइल डिलीट करें
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            res.status(500).json({ message: 'Update failed due to server error.' });
        }
    });

    // ----------------------------------------------------------------------
    // 4. DELETE (DELETE) - ऐड को डिलीट करें
    // ----------------------------------------------------------------------
    router.delete('/:id', protect, async (req, res) => {
        try {
            const ad = await Ad.findOne({ _id: req.params.id, userId: req.user.uid }); // ID और User दोनों चेक करें
            if (!ad) return res.status(404).json({ message: 'Ad not found or unauthorized' });
            if (ad.public_id) {
                try {
                    await cloudinary.uploader.destroy(ad.public_id, {
                        resource_type: ad.type === 'video' ? 'video' : 'image'
                    });
                } catch (cloudError) {
                    console.warn("Cloudinary old file deletion failed:", cloudError.message);
                }
            }

            // 2. DB से डिलीट करें
            await Ad.findByIdAndDelete(req.params.id);

            // 3. अपडेट भेजें
            io.emit('ad-deleted', req.params.id);

            res.json({ message: 'Ad removed' });
        } catch (error) {
            console.error("Delete Error:", error);
            res.status(500).json({ message: 'Ad removal failed.' });
        }
    });

    return router;
};