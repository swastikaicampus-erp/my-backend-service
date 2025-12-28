const admin = require('firebase-admin');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Initialized");
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
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 1. USER SCHEMA & MODEL (For Registration) ---
const UserSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true },
    fullName: String,
    email: String,
    shopName: String,
    phone: String,
    selectedPlan: String,
    planPrice: String,
    createdAt: { type: Date, default: Date.now }
});

// मॉडल को चेक करें कि कहीं पहले से तो नहीं बना (Render re-deploy safety)
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected successfully!'))
    .catch(err => {
        console.error('❌ DB Connection Error:', err);
    });

// --- 2. USER REGISTRATION API ROUTE ---
app.post('/api/users/register', async (req, res) => {
    try {
        console.log("New Signup Request:", req.body);
        const { uid, fullName, email, shopName, phone, selectedPlan, planPrice } = req.body;

        const newUser = new User({
            uid,
            fullName,
            email,
            shopName,
            phone,
            selectedPlan,
            planPrice
        });

        await newUser.save();
        res.status(201).json({ success: true, message: "User registered in DB!" });
    } catch (err) {
        console.error("Signup DB Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 🚀 REAL-TIME SOCKET.IO LOGIC
io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    socket.on('register_device', (deviceId) => {
        socket.join(deviceId);
        console.log(`[SOCKET] Device registered: ${deviceId}`);
    });

    socket.on('admin_command', (data) => {
        const { targetId, command } = data;
        if (targetId && command) {
            io.to(targetId).emit('admin_command', data);
            console.log(`[COMMAND] Sent ${command} to ${targetId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${socket.id}`);
    });
});

// Routes
app.use('/api/ads', adRoutes(io));
app.use('/api/playlists', playlistRoutes(io));
app.use('/uploads', express.static('uploads'));

// Error Handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: 'Something broke on the server side!' });
});

// Start Server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));