const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    otp: String,
    isVerified: { type: Boolean, default: false },
    resetOtp: String,
    resetExpiry: Date,
    profileTeacher: String,
    profileSchool: String
});

const ChatMessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, required: true },
    channel: { type: String, default: 'staff' },
    time: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);

const PortfolioSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    studentName: { type: String, required: true },
    projectTitle: { type: String, required: true },
    description: { type: String },
    photos: [String], // Array of Base64 strings
    timestamp: { type: Date, default: Date.now }
});

const WeeklyPlanSchema = new mongoose.Schema({
    userEmail: { type: String, required: true, unique: true },
    data: { type: Map, of: String } // Stores time-day keys and their text values
});

const Portfolio = mongoose.model('Portfolio', PortfolioSchema);
const WeeklyPlan = mongoose.model('WeeklyPlan', WeeklyPlanSchema);

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pedagogy';
        await mongoose.connect(uri);
        console.log('MongoDB connected...');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        // Don't exit process in development, maybe?
    }
};

module.exports = { User, ChatMessage, Portfolio, WeeklyPlan, connectDB };
