const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('./config/db'); 
const path = require('path');

const app = express();
// --- IN-MEMORY CACHE SETUP ---
const matchCache = {}; // Stores the data
const CACHE_DURATION = 60 * 1000; // 60 seconds (in milliseconds)

app.use(cors());
// Upgraded to accept 50MB Base64 Image Strings!
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// --- STATIC FILES ---
// This allows the browser to access CSS, images, and JS files in the public folder
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// --- DEFAULT ROUTE (THE FRONT DOOR) ---
// When a user visits localhost:5000, explicitly send them the login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- ROUTE 2: CHALLONGE BRACKET GENERATOR (THE MEGA ROUTE) ---
app.post('/api/bracket/create', async (req, res) => {
    try {
        // Now we also expect a 'teams' array from the frontend
        const { tournament_name, game, teams } = req.body;
        const uniqueUrl = 'obsidian_' + Math.random().toString(36).substring(2, 10);
        const apiKey = process.env.CHALLONGE_KEY;
        const headers = { 'Content-Type': 'application/json' };

        // --- STEP 1: CREATE THE TOURNAMENT ---
        const createPayload = {
            api_key: apiKey,
            tournament: { name: tournament_name, url: uniqueUrl, tournament_type: 'single elimination', game_name: game }
        };
        const createRes = await fetch('https://api.challonge.com/v1/tournaments.json', {
            method: 'POST', headers, body: JSON.stringify(createPayload)
        });
        if (!createRes.ok) throw new Error('Step 1 Failed: Could not create tournament');


        // --- STEP 2: BULK ADD THE TEAMS ---
        // Challonge expects an array of objects like [{name: "Team A"}, {name: "Team B"}]
        const participantPayload = {
            api_key: apiKey,
            participants: teams.map(teamName => ({ name: teamName }))
        };
        const addRes = await fetch(`https://api.challonge.com/v1/tournaments/${uniqueUrl}/participants/bulk_add.json`, {
            method: 'POST', headers, body: JSON.stringify(participantPayload)
        });
        if (!addRes.ok) throw new Error('Step 2 Failed: Could not add teams');


        // --- STEP 3: START THE TOURNAMENT ---
        // This is the trigger that actually draws the bracket lines!
        const startRes = await fetch(`https://api.challonge.com/v1/tournaments/${uniqueUrl}/start.json`, {
            method: 'POST', headers, body: JSON.stringify({ api_key: apiKey })
        });
        if (!startRes.ok) throw new Error('Step 3 Failed: Could not start tournament');


        // --- SUCCESS: SEND TO FRONTEND ---
        res.status(201).json({
            message: 'Bracket populated and started!',
            iframe_url: `https://challonge.com/${uniqueUrl}/module`
        });

    } catch (err) {
        console.error("Mega-Bracket Error:", err);
        res.status(500).json({ error: 'Failed to generate and populate bracket' });
    }
});

// --- ROUTE 3: REGISTRATION ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await db.query(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Username/Email exists.' });
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// --- ROUTE 4: LOGIN ---
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length === 0) return res.status(400).json({ message: 'User not found.' });
        
        const isMatch = await bcrypt.compare(password, users[0].password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid password.' });

        const token = jwt.sign({ id: users[0].id, username: users[0].username }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'Login successful', token: token });
    } catch (err) {
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// --- ROUTE 5: FETCH USER PROFILE (SECURE ROUTE) ---
app.get('/api/profile', async (req, res) => {
    try {
        // 1. Check if the frontend brought the VIP Badge (Token)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }

        // 2. Extract and verify the token
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // decoded.id now contains the exact ID of the logged-in user!

        // 3. Fetch their actual stats from your MySQL database
        // (Assuming you have tournaments_won, matches_played, reputation in your users table)
        const [users] = await db.query(
            'SELECT username, tournaments_won, matches_played, reputation FROM users WHERE id = ?', 
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ message: 'User profile not found.' });
        }

        // 4. Send the data back to the portfolio page!
        res.json(users[0]);

    } catch (err) {
        console.error("Profile Error:", err);
        res.status(401).json({ message: 'Invalid or expired token. Please log in again.' });
    }
});
// --- ROUTE 7: GET CHAT CONTACTS (Other Users) ---
app.get('/api/users', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Access denied' });
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);

        // Fetch all registered users EXCEPT the person currently logged in
        const [users] = await db.query('SELECT id, username FROM users WHERE id != ?', [decoded.id]);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// --- ROUTE 8: GET MESSAGE HISTORY ---
app.get('/api/messages/:otherUserId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Access denied' });
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        
        const myId = decoded.id;
        const otherId = req.params.otherUserId;

        // Grab all messages where I sent it to them, OR they sent it to me, ordered by time
        const [messages] = await db.query(
            `SELECT * FROM messages 
             WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) 
             ORDER BY sent_at ASC`,
            [myId, otherId, otherId, myId]
        );
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

// --- ROUTE 9: SEND A MESSAGE ---
app.post('/api/messages/send', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Access denied' });
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        
        const sender_id = decoded.id;
        const { receiver_id, message_content } = req.body;

        await db.query(
            'INSERT INTO messages (sender_id, receiver_id, message_content) VALUES (?, ?, ?)',
            [sender_id, receiver_id, message_content]
        );
        res.status(201).json({ message: 'Message sent!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// --- ROUTE 8: GET MESSAGE HISTORY (UPGRADED FOR GLOBAL CHAT) ---
app.get('/api/messages/:otherUserId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Access denied' });
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        
        const myId = decoded.id;
        const otherId = parseInt(req.params.otherUserId); // Convert to number

        // --- THE GLOBAL ROOM LOGIC ---
        if (otherId === 9999) {
            const [globalMessages] = await db.query(
                `SELECT m.*, u.username as sender_name 
                 FROM messages m 
                 JOIN users u ON m.sender_id = u.id 
                 WHERE m.receiver_id = 9999 
                 ORDER BY m.sent_at ASC`
            );
            return res.json(globalMessages);
        }
        // --- STANDARD 1-ON-1 DM LOGIC ---
        const [messages] = await db.query(
            `SELECT * FROM messages 
             WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) 
             ORDER BY sent_at ASC`,
            [myId, otherId, otherId, myId]
        );
        res.json(messages);
    } catch (err) {
        console.error("Chat Error:", err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});
// --- ROUTE: FETCH MATCHES (WITH IN-MEMORY CACHING) ---
app.get('/api/matches', async (req, res) => {
    try {
        // 1. Get the game requested by the frontend
        const requestedGame = req.query.game ? req.query.game.toLowerCase() : 'all';

        // 2. CHECK THE CACHE FIRST!
        const now = Date.now();
        // If we have data for this game AND it is less than 60 seconds old...
        if (matchCache[requestedGame] && (now - matchCache[requestedGame].lastFetch < CACHE_DURATION)) {
            console.log(` [CACHE HIT] Serving ${requestedGame} from RAM instantly!`);
            return res.json(matchCache[requestedGame].data); // Send it and stop here!
        }

        // 3. Map your UI names to PandaScore's internal slugs
        const gameSlugs = {
            'valorant': 'valorant',
            'counter-strike 2': 'csgo', 
            'fortnite': 'fortnite'
        };

        // 4. Build the PandaScore URL
        let pandaUrl = 'https://api.pandascore.co/matches/running'; 
        if (requestedGame !== 'all' && gameSlugs[requestedGame]) {
            pandaUrl = `https://api.pandascore.co/${gameSlugs[requestedGame]}/matches/running`;
        }

        console.log(`🐢 [CACHE MISS] Fetching fresh ${requestedGame} data from PandaScore...`);

        // 5. Fetch the fresh data from PandaScore securely
        const response = await fetch(pandaUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.PANDASCORE_KEY}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error('PandaScore API failed');
        const data = await response.json();

        // 6. SAVE TO RAM FOR THE NEXT USER
        matchCache[requestedGame] = {
            data: data,
            lastFetch: now
        };

        // 7. Send it back to the Obsidian frontend
        res.json(data);

    } catch (error) {
        console.error("PandaScore Error:", error);
        res.status(500).json({ error: 'Failed to sync with live servers.' });
    }
    // --- ROUTE 5: FETCH USER PROFILE (UPGRADED) ---
app.get('/api/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access denied.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch ALL relevant profile data from the database
        const [users] = await db.query(
            'SELECT username, tournaments_won, matches_played, reputation, profile_pic_url, banner_url, riot_tracker_id FROM users WHERE id = ?', 
            [decoded.id]
        );

        if (users.length === 0) return res.status(404).json({ message: 'User not found.' });

        res.json(users[0]);
    } catch (err) {
        console.error("Profile Error:", err);
        res.status(401).json({ message: 'Invalid token.' });
    }
});

// --- ROUTE: UPDATE PROFILE DATA (NOW WITH IMAGES) ---
app.post('/api/profile/update', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Access denied' });
        
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        
        // Destructure the incoming data
        const { riot_tracker_id, profile_pic_url, banner_url } = req.body;

        // Build a dynamic SQL query that only updates what the user actually changed
        let updates = [];
        let params = [];

        if (riot_tracker_id) { updates.push('riot_tracker_id = ?'); params.push(riot_tracker_id); }
        if (profile_pic_url) { updates.push('profile_pic_url = ?'); params.push(profile_pic_url); }
        if (banner_url) { updates.push('banner_url = ?'); params.push(banner_url); }

        // If they actually changed something, save it to the database
        if (updates.length > 0) {
            params.push(decoded.id); // Add the user's ID to the end of the array for the WHERE clause
            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        res.json({ message: 'Profile and Images updated successfully!' });
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        console.log(" PING: Fetching Marketplace data!"); 
        const [inventory] = await db.query('SELECT * FROM products');
        res.json(inventory);
    } catch (err) {
        console.error("MYSQL ERROR:", err.message); 
        res.status(500).json({ error: 'Failed to load Obsidian inventory.' });
    }
});

// --- START THE SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
});
// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Obsidian Backend running perfectly on http://localhost:${PORT}`);
});