const mongoose = require('mongoose');
require('dotenv').config();
const { User } = require('./db');

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const users = await User.find({}, 'email name isVerified');
        console.log('--- USERS IN DATABASE ---');
        console.log(users);
        console.log('-------------------------');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
