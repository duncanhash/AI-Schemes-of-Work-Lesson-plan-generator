const mongoose = require('mongoose');
require('dotenv').config();
const { User } = require('./db');

async function clean() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        await User.deleteMany({ email: /@pedagogy.com/ });
        console.log('--- CLEANED TEST USERS ---');
        process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
}
clean();
