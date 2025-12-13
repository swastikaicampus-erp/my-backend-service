// --- server.js (Final Verified Code) ---

require('dotenv').config(); // ✅ CHANGE 1: Local .env support ke liye uncomment kiya
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const admin = require('firebase-admin'); // Firebase Admin SDK

// 🚨 Firebase Admin Initialization 🚨
let serviceAccountConfig;

// 1. Environment Variable से लोड करने का प्रयास (Render/Production)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccountConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log("✅ Using Firebase config from Environment Variable (Production).");
    } catch (err) {
        console.error("❌ CRITICAL ERROR: FIREBASE_SERVICE_ACCOUNT JSON parsing failed!", err);
        process.exit(1);
    }
} 
// 2. यदि Environment Variable नहीं मिला, तो Local File से लोड करने का प्रयास (Development)
else {
    try {
        serviceAccountConfig = require('./serviceAccountKey.json');
        console.log("⚠️ Using Firebase config from local file (Development).");
    } catch (err) {
        // Dev mein yeh error aayega agar file nahi mili, par production mein yeh block chalega nahi
        console.warn("⚠️ Warning: Firebase Service Account Key not found locally. Check FIREBASE_SERVICE_ACCOUNT variable on Render.");
        // We will continue to run, but Firebase functionality won't work in this case
    }
}

// 3. यदि Config मिला, तो Firebase को Initialize करें
if (serviceAccountConfig && !admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountConfig)
        });
        console.log("✅ Firebase Admin SDK initialized successfully.");
    } catch (err) {
        console.error("❌ CRITICAL ERROR: Firebase Admin Initialization failed!", err);
        process.exit(1);
    }
}


// Routes Import 
const adRoutes = require('./routes/adRoutes');
const playlistRoutes = require('./routes/playlistRoutes');

// App Initialization
const app = express();
const server = http.createServer(app);

// Socket.IO Setup
const io = new Server(server, {
    cors: {
        origin: "*", // Production mein specific URL de sakte hain
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Middleware
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected successfully!'))
    .catch(err => {
        console.error('❌ DB Connection Error:', err);
        process.exit(1);
    });


// 🚀 REAL-TIME SOCKET.IO LOGIC (Controller & Display Communication)
io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    // 1. DEVICE REGISTRATION
    socket.on('register_device', (deviceId) => {
        socket.join(deviceId);
        console.log(`[SOCKET] Device registered: ${deviceId}. Joined room: ${deviceId}`);
    });

    // 2. ADMIN/CONTROLLER COMMAND
    socket.on('admin_command', (data) => {
        const { targetId, command, payload } = data;

        if (!targetId || !command) {
            return console.error("Invalid command received: targetId or command missing.");
        }

        console.log(`[COMMAND] Admin Command: [${command}] for Target: ${targetId}`);

        io.to(targetId).emit(command, payload);

        if (io.sockets.adapter.rooms.get(targetId)) {
            console.log(`[COMMAND] Successfully forwarded ${command} to room ${targetId}`);
        } else {
            console.warn(`[COMMAND] Warning: Target room ${targetId} does not seem to exist.`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${socket.id}`);
    });
});

// Routes
app.use('/api/ads', adRoutes(io));
app.use('/api/playlists', playlistRoutes(io));

// Error Handling Middleware (Generic)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: 'Something broke on the server side!' });
});


// Start Server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// --- end of server.js ---