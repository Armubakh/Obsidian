const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('./config/db'); 
const path = require('path');

const app = express();

//  IN-MEMORY CACHE SETUP 
const matchCache = {}; 
const CACHE_DURATION = 60 * 1000; 

//  CORS SETUP 
const corsOptions = {
    origin: [
        'http://localhost:5500', 
        'https://obsidian-nine-ashy.vercel.app' 
    ],
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Accept 50MB Base64 Image Strings for profile uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

//  STATIC FILES
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

//  DEFAULT ROUTE 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
// The missing security checkpoint function
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Looks for "Bearer [TOKEN]"

    if (!token) return res.status(401).json({ message: "Access Denied. Please log in." });

    // Note: Make sure your .env file has a JWT_SECRET defined!
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid or expired token." });
        req.user = user; // Passes the user info to the next function
        next();
    });
}
//  CHALLONGE BRACKET GENERATOR 
app.post('/api/bracket/create', async (req, res) => {
    try {
        const { tournament_name, game, teams } = req.body;
        const uniqueUrl = 'obsidian_' + Math.random().toString(36).substring(2, 10);
        const apiKey = process.env.CHALLONGE_KEY;
        const headers = { 'Content-Type': 'application/json' };

        const createPayload = {
            api_key: apiKey,
            tournament: { name: tournament_name, url: uniqueUrl, tournament_type: 'single elimination', game_name: game }
        };
        const createRes = await fetch('https://api.challonge.com/v1/tournaments.json', {
            method: 'POST', headers, body: JSON.stringify(createPayload)
        });
        if (!createRes.ok) throw new Error('Step 1 Failed: Could not create tournament');

        const participantPayload = {
            api_key: apiKey,
            participants: teams.map(teamName => ({ name: teamName }))
        };
        const addRes = await fetch(`https://api.challonge.com/v1/tournaments/${uniqueUrl}/participants/bulk_add.json`, {
            method: 'POST', headers, body: JSON.stringify(participantPayload)
        });
        if (!addRes.ok) throw new Error('Step 2 Failed: Could not add teams');

        const startRes = await fetch(`https://api.challonge.com/v1/tournaments/${uniqueUrl}/start.json`, {
            method: 'POST', headers, body: JSON.stringify({ api_key: apiKey })
        });
        if (!startRes.ok) throw new Error('Step 3 Failed: Could not start tournament');

        res.status(201).json({
            message: 'Bracket populated and started!',
            iframe_url: `https://challonge.com/${uniqueUrl}/module`
        });
    } catch (err) {
        console.error("Mega-Bracket Error:", err);
        res.status(500).json({ error: 'Failed to generate and populate bracket' });
    }
});

// REGISTRATION 
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.query(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Username/Email exists.' });
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

//  LOGIN 
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

//  FETCH USER PROFILE 
app.get('/api/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access denied.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const [users] = await db.query(
            'SELECT username, tournaments_won, matches_played, reputation, profile_pic_url, banner_url, riot_tracker_id FROM users WHERE id = ?', 
            [decoded.id]
        );

        if (users.length === 0) return res.status(404).json({ message: 'User profile not found.' });

        res.json(users[0]);
    } catch (err) {
        console.error("Profile Error:", err);
        res.status(401).json({ message: 'Invalid or expired token.' });
    }
});

//  UPDATE PROFILE DATA 
app.post('/api/profile/update', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Access denied' });
        
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        const { riot_tracker_id, profile_pic_url, banner_url } = req.body;

        let updates = [];
        let params = [];

        if (riot_tracker_id) { updates.push('riot_tracker_id = ?'); params.push(riot_tracker_id); }
        if (profile_pic_url) { updates.push('profile_pic_url = ?'); params.push(profile_pic_url); }
        if (banner_url) { updates.push('banner_url = ?'); params.push(banner_url); }

        if (updates.length > 0) {
            params.push(decoded.id);
            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        res.json({ message: 'Profile and Images updated successfully!' });
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// GET CHAT CONTACTS 
app.get('/api/users', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Access denied' });
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);

        const [users] = await db.query('SELECT id, username FROM users WHERE id != ?', [decoded.id]);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// GET MESSAGE HISTORY (INCLUDES GLOBAL CHAT ID 9999) 
app.get('/api/messages/:otherUserId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Access denied' });
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        
        const myId = decoded.id;
        const otherId = parseInt(req.params.otherUserId);

        if (otherId === 9999) {
            const [globalMessages] = await db.query(
                `SELECT m.*, u.username as sender_name FROM messages m 
                 JOIN users u ON m.sender_id = u.id 
                 WHERE m.receiver_id = 9999 ORDER BY m.sent_at ASC`
            );
            return res.json(globalMessages);
        }
        
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

// SEND A MESSAGE 
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

//  FETCH LIVE MATCHES (CACHED) 
app.get('/api/matches', async (req, res) => {
    try {
        const requestedGame = req.query.game ? req.query.game.toLowerCase() : 'all';
        const now = Date.now();
        
        if (matchCache[requestedGame] && (now - matchCache[requestedGame].lastFetch < CACHE_DURATION)) {
            return res.json(matchCache[requestedGame].data); 
        }

        const gameSlugs = { 'valorant': 'valorant', 'counter-strike 2': 'csgo', 'fortnite': 'fortnite' };
        let pandaUrl = 'https://api.pandascore.co/matches/running'; 
        if (requestedGame !== 'all' && gameSlugs[requestedGame]) {
            pandaUrl = `https://api.pandascore.co/${gameSlugs[requestedGame]}/matches/running`;
        }

        const response = await fetch(pandaUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.PANDASCORE_KEY}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error('PandaScore API failed');
        const data = await response.json();

        matchCache[requestedGame] = { data: data, lastFetch: now };
        res.json(data);
    } catch (error) {
        console.error("PandaScore Error:", error);
        res.status(500).json({ error: 'Failed to sync with live servers.' });
    }
});

//  MARKETPLACE PRODUCTS 
app.get('/api/products', async (req, res) => {
    try {
        const [inventory] = await db.query('SELECT * FROM products');
        res.json(inventory);
    } catch (err) {
        console.error("MYSQL ERROR:", err.message); 
        res.status(500).json({ error: 'Failed to load Obsidian inventory.' });
    }
});

// POST: Register for a Tournament
app.post('/api/register-tournament', authenticateToken, async (req, res) => {
    const { game, tournament_name, in_game_name, contact_info, team_type } = req.body;
    const user_id = req.user.id;

    try {
        const query = `
            INSERT INTO tournament_registrations 
            (user_id, game, tournament_name, in_game_name, contact_info, team_type) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        // Using modern async/await to talk to your database
        await db.query(query, [user_id, game, tournament_name, in_game_name, contact_info, team_type]);
        
        // Instantly reply back to the frontend on success
        res.status(200).json({ message: "Successfully registered!" });
        
    } catch (error) {
        console.error("Database error during registration:", error);
        
        // Instantly reply back to the frontend on failure
        res.status(500).json({ message: "Database error. Check Render logs." });
    }
});

// POST: Save a custom generated bracket
app.post('/api/save-bracket', authenticateToken, async (req, res) => {
    const { tournament_name, game, format, teams_count, bracket_url } = req.body;
    const user_id = req.user.id;

    try {
        const query = `
            INSERT INTO custom_tournaments 
            (user_id, tournament_name, game, format, teams_count, bracket_url) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        await db.query(query, [user_id, tournament_name, game, format, teams_count, bracket_url]);
        res.status(200).json({ message: "Tournament and Bracket saved successfully!" });
        
    } catch (error) {
        console.error("Database error saving bracket:", error);
        res.status(500).json({ message: "Failed to save tournament to database." });
    }
});
//  START SERVER 
// Using process.env.PORT allows Render to assign the correct port dynamically[cite: 3].
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Obsidian Backend running on port ${PORT}`);
});