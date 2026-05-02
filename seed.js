const bcrypt = require('bcrypt');
const db = require('./config/db'); // Pulling your exact database connection

async function seedTestUsers() {
    console.log("Initializing Obsidian Database Seeding...");

    // 1. We tell bcrypt to encrypt '1234' the exact same way your server does
    const plainTextPassword = '1234';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainTextPassword, salt);

    // 2. The Founders Array
    const founders = [
        { name: 'Armughan', email: 'armughan@obsidian.gg' },
        { name: 'Wasil', email: 'wasil@obsidian.gg' },
        { name: 'Ahmad', email: 'ahmad@obsidian.gg' }
    ];

    // 3. Loop through and inject them into MySQL
    for (const founder of founders) {
        try {
            // Adding them with perfect 5.0 reputations and admin privileges!
            await db.query(
                `INSERT INTO users (username, email, password, reputation, is_admin) 
                 VALUES (?, ?, ?, 5.0, TRUE)`,
                [founder.name, founder.email, hashedPassword]
            );
            console.log(`✅ Successfully recruited: ${founder.name}`);
        } catch (err) {
            // This will catch if you accidentally run it twice and hit a Duplicate Entry error
            console.log(`⚠️ Skipped ${founder.name}: ${err.code}`);
        }
    }

    console.log("Seeding Complete! Press Ctrl+C to exit, then start your server.");
}

seedTestUsers();