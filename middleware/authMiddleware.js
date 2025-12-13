const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // डाउनलोड की गई फाइल का पथ

// Firebase Admin को initialize करें (अगर पहले से नहीं है)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // "Bearer <token>" में से टोकन निकालें
            token = req.headers.authorization.split(' ')[1];

            // Firebase से टोकन वेरीफाई करें
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