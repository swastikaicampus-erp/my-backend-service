const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
    name: { type: String, required: true },         // e.g. "Gold Plan"
    duration: { type: String, required: true },     // e.g. "3 Months"
    price: { type: Number, required: true },        // Real Price (₹999)
    originalPrice: { type: Number },                // Strikethrough Price (₹1499)
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Plan', PlanSchema);