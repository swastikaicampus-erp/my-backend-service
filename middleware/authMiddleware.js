// --- middleware/authMiddleware.js (Fixed Code) ---

// Sirf 'firebase-admin' ko require karein, initialization ki zaroorat nahi hai
const admin = require('firebase-admin'); 

// Zaroori: Aapka server.js pehle hi Admin SDK ko initialize kar chuka hai. 
// Baaki ka sara code jo Firebase Admin ko initialize karta tha, use remove kar den.

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // "Bearer <token>" में से टोकन निकालें
            token = req.headers.authorization.split(' ')[1];

            // Firebase से टोकन वेरीफाई करें (Admin SDK ab use ke liye ready hai)
            const decodedToken = await admin.auth().verifyIdToken(token);
            
            // यूजर की जानकारी req.user में डालें
            req.user = decodedToken;
            
            next();
        } catch (error) {
            console.error('Auth Error:', error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = { protect };