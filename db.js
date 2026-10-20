const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: String, email: { type: String, unique: true }, password: { type: String, required: true },
    role: { type: String, default: 'teacher' }, otp: String, isVerified: { type: Boolean, default: false },
    curriculumText: String, curriculumText1: String, curriculumText2: String,
    curriculumSubject1: String, curriculumGrade1: String, curriculumSubject2: String, curriculumGrade2: String,
    school: String, subjects: String,
    subject1: String, subject2: String,
    profileTeacher: String, profileSchool: String,
    profilePicture: String,
    resetOtp: String, resetExpiry: Date,
    lastLogin: { type: Date, default: Date.now },
    loggedOutAt: { type: Date },
    plan: { type: String, default: 'free', enum: ['free', 'pro', 'school'] }
});

const portfolioSchema = new mongoose.Schema({
    userEmail: String, studentName: String, projectTitle: String, description: String,
    photos: [String], sharedWith: String, timestamp: { type: Number, default: Date.now }
});
const chatSchema = new mongoose.Schema({
    sender: String, senderName: String, text: String, time: String, channel: { type: String, default: 'staff' },
    timestamp: { type: Number, default: Date.now }
});
const planSchema = new mongoose.Schema({ userEmail: { type: String, unique: true }, data: Object });
const sowSchema = new mongoose.Schema({
    userEmail: String, title: String, grade: String, subject: String, term: String, strands: String,
    html: String, timestamp: { type: Number, default: Date.now }
});
const progressSchema = new mongoose.Schema({
    teacherEmail: String, term: String, sharedWith: String,
    studentsData: Array,
    studentName: String, mathScore: String, englishScore: String, scienceScore: String, rubric: String, remarks: String,
    timestamp: { type: Number, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Portfolio = mongoose.model('Portfolio', portfolioSchema);
const ChatMessage = mongoose.model('ChatMessage', chatSchema);
const WeeklyPlan = mongoose.model('WeeklyPlan', planSchema);
const SavedSOW = mongoose.model('SavedSOW', sowSchema);
const LearnerProgress = mongoose.model('LearnerProgress', progressSchema);

const connectDB = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is required. Configure it in .env locally or in the hosting service environment.');
    }

    await mongoose.connect(uri);
    console.log('MONGODB CONNECTED: Persistent database ready');
};

module.exports = { User, ChatMessage, Portfolio, WeeklyPlan, SavedSOW, LearnerProgress, connectDB };
