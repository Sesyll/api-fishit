const express = require("express");
const axios = require("axios");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// *** PENTING: HEALTH CHECK UNTUK RAILWAY ***
// Endpoint ini memastikan Railway tahu bahwa server sudah berjalan.
app.get("/", (req, res) => {
    // Railway akan memanggil endpoint ini untuk verifikasi.
    res.status(200).send("Roblox Status API is LIVE.");
});
// **********************************************


// Set HEADERS, prefer request header cookie over .env cookie
const getHeaders = (cookie) => {
    return cookie ? { Cookie: `.ROBLOSECURITY=${cookie}` } : {};
};

/**
 * Mengambil User ID untuk daftar username.
 * Mengembalikan objek map {username: userId}.
 */
async function getUserIds(usernames) {
    if (usernames.length === 0) return {};
    
    // Roblox API hanya bisa memproses 100 username per request
    const chunks = [];
    for (let i = 0; i < usernames.length; i += 100) {
        chunks.push(usernames.slice(i, i + 100));
    }

    const userMap = {};
    for (const chunk of chunks) {
        try {
            const resp = await axios.post(
                "https://users.roblox.com/v1/usernames/users",
                { usernames: chunk },
                { headers: { "Content-Type": "application/json" } }
            );
            resp.data.data.forEach(user => {
                userMap[user.name.toLowerCase()] = user.id;
            });
        } catch (error) {
            console.error("Error fetching user IDs chunk:", error.message);
            // Melanjutkan ke chunk berikutnya
        }
    }
    return userMap;
}

/**
 * Mengambil nama game berdasarkan Place ID atau Universe ID.
 */
async function getGameInfo(id, cookie) {
    if (!id) return "Unknown Place";

    const headers = getHeaders(cookie);

    try {
        // Coba universeId dulu (jika ada), lalu placeId. 
        // Endpoint ini bekerja untuk keduanya meskipun namanya place-details.
        const resp = await axios.get(
            `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${id}`,
            { headers }
        );
        const placeData = resp.data[0];
        return placeData?.name || "Unknown Place";
    } catch (err) {
        return "Unknown Place";
    }
}

// *** ENDPOINT INI MENGGUNAKAN POST dan MENDAPATKAN USERNAME DARI BODY REQUEST ***
app.post("/api/status", async (req, res) => {
    // Cookie diambil dari header khusus 'x-roblox-cookie' yang dikirim oleh frontend
    const cookie = req.headers['x-roblox-cookie'];
    // Username diambil dari body request (req.body.users)
    const users = req.body.users; 
    
    if (!users || users.length === 0) {
        return res.status(400).json({ error: "Daftar pengguna kosong." });
    }

    // 1. Get all User IDs first
    const uniqueUsers = [...new Set(users.map(u => u.trim()).filter(u => u))];
    const userMap = await getUserIds(uniqueUsers);
    
    // 2. Filter out usernames that couldn't be found and prepare for presence call
    const validUserIds = Object.values(userMap);
    
    // 3. Get Presence for all valid users in one API call
    const presenceBody = { userIds: validUserIds };
    let presenceData = { userPresences: [] };
    const headers = getHeaders(cookie);

    if (validUserIds.length > 0) {
        try {
             const resp = await axios.post("https://presence.roblox.com/v1/presence/users", presenceBody, { headers });
             presenceData = resp.data;
        } catch (e) {
             console.error("Presence API failed:", e.message);
        }
    }
    
    // Map userId to presence object for quick lookup
    const presenceMap = {};
    presenceData.userPresences.forEach(p => {
        presenceMap[p.userId] = p;
    });
    
    // 4. Gather all results
    const results = [];
    
    // Reverse lookup to find username from userId
    const userIdToUsernameMap = Object.entries(userMap).reduce((acc, [username, id]) => {
        acc[id] = username;
        return acc;
    }, {});


    for (const username of uniqueUsers) {
        const userId = userMap[username.toLowerCase()];

        if (!userId) {
            results.push({ username, error: "Pengguna tidak ditemukan di Roblox." });
            continue;
        }

        const presence = presenceMap[userId];
        
        // --- Determine Status and Game Info ---
        let mapName = "Offline";
        let status = "Offline";
        let placeId = null;
        let universeId = null;
        let lastLocation = "Offline";

        if (presence) {
            placeId = presence.placeId;
            universeId = presence.universeId;
            lastLocation = presence.lastLocation;
            
            if (presence.userPresenceType === 3) { // In Game
                status = "In Game";
                mapName = await getGameInfo(presence.universeId || presence.placeId, cookie);
                if (!presence.placeId) {
                     mapName = "In Game (placeId hidden)";
                }

            } else if (presence.userPresenceType === 2) { // In Studio
                status = "In Game"; 
                mapName = "In Studio";
            }
            
            else if (presence.userPresenceType === 1) { // Online
                status = "Online";
                mapName = "Online di Website";
            }
        }

        results.push({
            username: userIdToUsernameMap[userId] || username, 
            userId, 
            status,
            placeId,
            universeId, 
            mapName,
            lastLocation,
        });
    }

    res.json(results);
});

// >>> PENTING: Gunakan PORT dari Environment Variable Railway <<<
// Mengubah default fallback port dari 3000 menjadi 8080.
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT} on host 0.0.0.0`));

// Ekspor aplikasi Express untuk digunakan dalam kasus pengujian atau integrasi (optional)
module.exports = app;
