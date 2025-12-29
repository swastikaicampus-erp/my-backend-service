const admin = require('firebase-admin');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

// Firebase Admin Initialization
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT.startsWith('{')
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Initialized Successfully");
} catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
}

// Routes Import 
const adRoutes = require('./routes/adRoutes');
const playlistRoutes = require('./routes/playlistRoutes');

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

// --- USER SCHEMA ---
const UserSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true },
    fullName: String,
    email: String,
    shopName: String,
    phone: String,
    selectedPlan: String,
    planPrice: String,
    isActive: { type: Boolean, default: true }, // Device status control
    expiryDate: { type: Date }, // Plan expiry handle karne ke liye
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected successfully!'))
    .catch(err => console.error('❌ DB Connection Error:', err));

// --- 1. USER REGISTRATION API ---
app.post('/api/users/register', async (req, res) => {
    try {
        const { uid, fullName, email, shopName, phone, selectedPlan, planPrice } = req.body;
        const newUser = new User({
            uid, fullName, email, shopName, phone, selectedPlan, planPrice
        });
        await newUser.save();
        res.status(201).json({ success: true, message: "User registered!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- 2. MASTER ADMIN APIs (New) ---

// Sabhi users ko fetch karne ke liye (Master Dashboard ke liye)
app.get('/api/master/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Plan Renew karne ke liye
app.put('/api/master/renew-plan/:uid', async (req, res) => {
    try {
        const { selectedPlan, planPrice } = req.body;
        const updatedUser = await User.findOneAndUpdate(
            { uid: req.params.uid },
            { selectedPlan, planPrice },
            { new: true }
        );
        
        // Real-time update bhejna user ke device ko
        io.to(req.params.uid).emit('plan_updated', updatedUser);
        
        res.json({ success: true, message: "Plan Renewed Successfully!", data: updatedUser });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- 🚀 REAL-TIME SOCKET LOGIC ---
const activeDevices = new Set();

io.on('connection', (socket) => {
    console.log(`[SOCKET] Connected: ${socket.id}`);

    socket.on('register_device', (deviceId) => {
        socket.join(deviceId);
        activeDevices.add(deviceId);
        // Master admin ko update dena ki naya device online aaya
        io.emit('online_devices_count', activeDevices.size);
        console.log(`[SOCKET] Device Online: ${deviceId}`);
    });

    socket.on('admin_command', (data) => {
        const { targetId, command } = data;
        io.to(targetId).emit('admin_command', data);
    });

    socket.on('disconnect', () => {
        activeDevices.delete(socket.id); // Simple logic, needs mapping for real deviceIds
        io.emit('online_devices_count', activeDevices.size);
        console.log(`[SOCKET] Disconnected: ${socket.id}`);
    });
});

// Routes usage
app.use('/api/ads', adRoutes(io));
app.use('/api/playlists', playlistRoutes(io));
app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Master Server running on port ${PORT}`));