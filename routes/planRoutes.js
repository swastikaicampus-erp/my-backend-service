const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');

// 1. CREATE: Naya plan add karne ke liye
router.post('/add', async (req, res) => {
    try {
        const newPlan = new Plan(req.body);
        const savedPlan = await newPlan.save();
        res.status(201).json(savedPlan);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. READ: Saare active plans fetch karne ke liye (Frontend use karega)
router.get('/', async (req, res) => {
    try {
        const plans = await Plan.find({ isActive: true });
        res.json(plans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. UPDATE: Plan edit karne ke liye (ID ke base par)
router.put('/update/:id', async (req, res) => {
    try {
        const updatedPlan = await Plan.findByIdAndUpdate(
            req.params.id, 
            { $set: req.body }, 
            { new: true }
        );
        res.json(updatedPlan);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. DELETE: Plan delete karne ke liye
router.delete('/delete/:id', async (req, res) => {
    try {
        await Plan.findByIdAndDelete(req.params.id);
        res.json({ message: "Plan deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;