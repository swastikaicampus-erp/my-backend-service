// functions/index.js

const functions = require("firebase-functions");
const mongoose = require("mongoose");
const express = require("express");

// Express App को 'server.js' से इंपोर्ट करें।
// '..' का मतलब है कि हम functions फोल्डर से बाहर निकलकर server.js को कॉल कर रहे हैं।
const app = require('../server'); 

// ✅ MongoDB Connect: इसे Firebase Config से एक्सेस करें
// (सुनिश्चित करें कि आपने 'web.mongo_uri' नाम का उपयोग किया है)
mongoose.connect(functions.config().web.mongo_uri) 
    .then(() => console.log("DB Connected successfully!"))
    .catch(err => console.error("DB Connection Error:", err));


// ✅ Export Function
exports.api = functions.https.onRequest(app);