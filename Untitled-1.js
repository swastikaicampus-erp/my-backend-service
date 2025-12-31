// --- server.js (Final Corrected Code) ---

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const admin = require('firebase-admin');

// ... (Firebase Admin Initialization remains the same) ...
let serviceAccountConfig;
// ... (Firebase setup logic) ...

// Routes Import 
const adRoutes = require('./routes/adRoutes');
const playlistRoutes = require('./routes/playlistRoutes');

// App Initialization
const app = express();
const server = http.createServer(app);

// Socket.IO Setup
const io = new Server(server, {
    cors: {
        origin: "*",
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

    // 1. DEVICE REGISTRATION: DisplayScreen sends its ID (e.g., 'SCREEN-01')
    socket.on('register_device', (deviceId) => {
        // Display Device को उसकी ID वाले रूम में जोड़ना
        socket.join(deviceId);
        console.log(`[SOCKET] Device registered: ${deviceId}. Joined room: ${deviceId}`);
    });

    // 2. ADMIN/CONTROLLER COMMAND: Mobile Controller sends command
    socket.on('admin_command', (data) => {
        const { targetId, command } = data;

        if (!targetId || !command) {
            return console.error("Invalid command received: targetId or command missing.");
        }

        console.log(`[COMMAND] Admin Command: [${command}] for Target: ${targetId}`);

        // कमांड को केवल लक्षित रूम में भेजें
        io.to(targetId).emit('admin_command', data);
        // -----------------------

        if (io.sockets.adapter.rooms.get(targetId)) {
            console.log(`[COMMAND] Successfully forwarded admin_command to room ${targetId}`);
        } else {
            console.warn(`[COMMAND] Warning: Target room ${targetId} does not seem to exist. Is the DisplayScreen connected?`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${socket.id}`);
    });
});

// Routes (Static file serving for media should be added here if needed)
app.use('/api/ads', adRoutes(io));
app.use('/api/playlists', playlistRoutes(io));
app.use('/uploads', express.static('uploads'));

// Error Handling Middleware (Generic)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: 'Something broke on the server side!' });
});


// Start Server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// --- end of server.js ---