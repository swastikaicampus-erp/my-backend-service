# backend/Dockerfile
FROM node:18-alpine

# वर्किंग डायरेक्टरी सेट करें
WORKDIR /usr/src/app

# पैकेज फ़ाइलें कॉपी करें और निर्भरताएँ इंस्टॉल करें
# Render Root Directory (backend) में package.json की तलाश करेगा।
COPY package*.json ./ 

RUN npm install --omit=dev

# बाकी एप्लीकेशन कोड कॉपी करें
COPY . .

# पोर्ट 8080 को expose करें (Render default)
EXPOSE 8080

# सर्वर शुरू करने के लिए कमांड
CMD ["npm", "start"]