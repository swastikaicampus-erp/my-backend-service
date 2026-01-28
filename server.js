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
// --- MASTER CONFIG SCHEMA ---
const ConfigSchema = new mongoose.Schema({
    key: { type: String, default: 'master_settings' },
    password: { type: String, default: 'ADMIN@SIGNAGE#2025' }
});
const Config = mongoose.models.Config || mongoose.model('Config', ConfigSchema);

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
        const { 
            uid, 
            fullName, 
            email, 
            shopName, 
            phone, 
            selectedPlan, 
            planPrice, 
            screenCount, 
            transactionId, 
            paymentScreenshot 
        } = req.body;
        
        const newUser = new User({
            uid, 
            fullName, 
            email, 
            shopName, 
            phone, 
            selectedPlan, 
            planPrice,
            screenCount: parseInt(screenCount) || 1, 
            transactionId,
            paymentScreenshot,
            isActive: false, 
            expiryDate: calculateExpiry(selectedPlan)
        });

        await newUser.save();
        res.status(201).json({ success: true, message: "Registered! Waiting for admin approval." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// --- Get All Users with Screen Stats ---
app.get('/api/master/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        
        // Optional: Total screens across all users nikalne ke liye
        const totalScreensDeployed = users.reduce((sum, user) => sum + (user.screenCount || 0), 0);

        res.json({ 
            success: true, 
            count: users.length, 
            totalScreens: totalScreensDeployed, // Admin dashboard par dikhane ke liye kaam aayega
            users 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Is route ko "USER REGISTRATION API" ke neeche add karein
app.get('/api/users/me', async (req, res) => {
    try {
        // Frontend se authorization header mein UID ya Token aayega
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ message: "No token provided" });

        // Note: Ideal case mein yahan Firebase Admin SDK se token verify hona chahiye
        // Par abhi ke liye hum UID se check kar rahe hain (agar aap token bhej rahe hain)
        const token = authHeader.split(' ')[1]; 
        
        // Firebase token se UID nikalne ka logic (Recommended)
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;

        const user = await User.findOne({ uid: uid });
        if (!user) return res.status(404).json({ message: "User not found" });

        // Hum status field dynamically bhejenge
        res.json({
            uid: user.uid,
            status: user.isActive ? 'active' : 'pending', // isActive false hai toh pending
            expiryDate: user.expiryDate
        });
    } catch (err) {
        res.status(401).json({ message: "Invalid Token" });
    }
});
// Apne existing toggle-status route ko update karein
app.put('/api/master/toggle-status/:uid', async (req, res) => {
    try {
        const user = await User.findOne({ uid: req.params.uid });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        user.isActive = !user.isActive; 
        await user.save();

        // --- NAYA LOGIC: Logout command bhejna agar deactivate kiya hai ---
        if (!user.isActive) {
            io.to(req.params.uid).emit('force_logout', { message: "Your account has been suspended." });
        } else {
            io.to(req.params.uid).emit('status_changed', { isActive: user.isActive });
        }

        res.json({ 
            success: true, 
            message: `User ${user.isActive ? 'Activated' : 'Suspended'} successfully`, 
            isActive: user.isActive 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// --- 2. MASTER APIs (For Admin Panel) ---
app.use('/api/plans', planRoutes);

// --- MASTER PASSWORD APIs ---
app.get('/api/master/config', async (req, res) => {
    try {
        let config = await Config.findOne({ key: 'master_settings' });
        if (!config) {
            config = new Config();
            await config.save();
        }
        res.json({ success: true, password: config.password });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/master/config', async (req, res) => {
    try {
        const { password } = req.body;
        const config = await Config.findOneAndUpdate(
            { key: 'master_settings' },
            { password: password },
            { new: true, upsert: true }
        );
        res.json({ success: true, message: "Master Password Updated!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Sabhi users fetch karna (Isme payment details bhi milengi)
app.get('/api/master/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.json({ success: true, count: users.length, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// Plan Renew
app.put('/api/master/renew-plan/:uid', async (req, res) => {
    try {
        // Body se screenCount bhi nikaal lein
        const { selectedPlan, planPrice, screenCount } = req.body;
        
        // Update object taiyar karein
        const updateFields = { 
            selectedPlan, 
            planPrice, 
            isActive: true, 
            expiryDate: calculateExpiry(selectedPlan) 
        };

        // Agar admin ne naya screenCount bheja hai, toh use update karein
        if (screenCount !== undefined) {
            updateFields.screenCount = parseInt(screenCount) || 1;
        }

        const updatedUser = await User.findOneAndUpdate(
            { uid: req.params.uid },
            updateFields,
            { new: true }
        );
        
        if (!updatedUser) return res.status(404).json({ success: false, message: "User not found" });

        // Real-time update bhejna (taaki app ko turant pata chal jaye)
        io.to(req.params.uid).emit('plan_updated', updatedUser);
        
        res.json({ 
            success: true, 
            message: "Plan Renewed & Screens Updated!", 
            data: updatedUser 
        });
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