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
const planRoutes = require('./routes/planRoutes');

const app = express();
const server = http.createServer(app);

// Socket.IO Setup
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Middleware - Image upload ke liye limit badhayi gayi hai
app.use(cors());
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- USER SCHEMA ---
const UserSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true },
    fullName: String,
    email: String,
    shopName: String,
    phone: String,
    selectedPlan: String,
    planPrice: String,
    // Naye Fields for Payment Verification
    transactionId: { type: String, required: true },
    paymentScreenshot: { type: String }, // Base64 String
    isActive: { type: Boolean, default: false }, // Default False (Admin approval needed)
    expiryDate: { type: Date }, 
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected successfully!'))
    .catch(err => console.error('❌ DB Connection Error:', err));

// --- HELPER: Calculate Expiry ---
const calculateExpiry = (planString) => {
    const months = parseInt(planString) || 3; 
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date;
};

// --- 1. USER REGISTRATION API ---
app.post('/api/users/register', async (req, res) => {
    try {
        const { uid, fullName, email, shopName, phone, selectedPlan, planPrice, transactionId, paymentScreenshot } = req.body;
        
        const newUser = new User({
            uid, 
            fullName, 
            email, 
            shopName, 
            phone, 
            selectedPlan, 
            planPrice,
            transactionId,
            paymentScreenshot,
            isActive: false, // User shuruat mein inactive rahega
            expiryDate: calculateExpiry(selectedPlan)
        });

        await newUser.save();
        res.status(201).json({ success: true, message: "Registered! Waiting for admin approval." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- 2. MASTER APIs (For Admin Panel) ---
app.use('/api/plans', planRoutes);

// Sabhi users fetch karna (Isme payment details bhi milengi)
app.get('/api/master/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.json({ success: true, count: users.length, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- TOGGLE ACTIVATE/DEACTIVATE (Naya API) ---
app.put('/api/master/toggle-status/:uid', async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        user.isActive = !user.isActive; // Toggle Status
        await user.save();

        // Real-time notification agar device online hai
        io.to(req.params.uid).emit('status_changed', { isActive: user.isActive });

        res.json({ 
            success: true, 
            message: `User ${user.isActive ? 'Activated' : 'Deactivated'} successfully`, 
            isActive: user.isActive 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Plan Renew
app.put('/api/master/renew-plan/:uid', async (req, res) => {
    try {
        const { selectedPlan, planPrice } = req.body;
        
        const updatedUser = await User.findOneAndUpdate(
            { uid: req.params.uid },
            { 
                selectedPlan, 
                planPrice, 
                isActive: true, // Renew karne par auto-active
                expiryDate: calculateExpiry(selectedPlan) 
            },
            { new: true }
        );
        
        if (!updatedUser) return res.status(404).json({ success: false, message: "User not found" });

        io.to(req.params.uid).emit('plan_updated', updatedUser);
        res.json({ success: true, message: "Plan Renewed!", data: updatedUser });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// User Delete
app.delete('/api/master/delete-user/:uid', async (req, res) => {
    try {
        await User.findOneAndDelete({ uid: req.params.uid });
        res.json({ success: true, message: "User deleted successfully" });
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
        io.emit('online_devices_count', activeDevices.size);
        console.log(`[SOCKET] Device Online: ${deviceId}`);
    });

    socket.on('admin_command', (data) => {
        const { targetId, command } = data;
        io.to(targetId).emit('admin_command', data);
    });

    socket.on('disconnect', () => {
        // Socket mapping logic should be added here for precise device tracking
        activeDevices.delete(socket.id); 
        io.emit('online_devices_count', activeDevices.size);
        console.log(`[SOCKET] Disconnected: ${socket.id}`);
    });
});

// Routes usage
app.use('/api/ads', adRoutes(io));
app.use('/api/playlists', playlistRoutes(io));
app.use('/api/plans', planRoutes);
app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Master Server running on port ${PORT}`));