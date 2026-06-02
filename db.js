const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DB_PATH = path.join(__dirname, 'local_db.json');
const USE_MONGO = process.env.MONGODB_URI ? true : false;

// ── LOCAL JSON FALLBACK (Mock Model) ──
function readDB() {
    if (!fs.existsSync(DB_PATH)) return { users: [], portfolios: [], messages: [], plans: [], sows: [], progress: [] };
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

class MockModel {
    constructor(data, collection) {
        Object.assign(this, data);
        this._collection = collection;
    }
    static async findOne(query) {
        const db = readDB();
        const collectionName = this._collectionName;
        const data = db[collectionName].find(item => Object.keys(query).every(k => item[k] === query[k]));
        return data ? new this(data) : null;
    }
    static async find(query) {
        const db = readDB();
        const collectionName = this._collectionName;
        let results = db[collectionName].filter(item => Object.keys(query).every(k => item[k] === query[k]));
        results.sort = () => { results.reverse(); return results; };
        results.limit = (n) => results.slice(0, n);
        return results;
    }
    static async findOneAndUpdate(query, update) {
        const db = readDB();
        const collectionName = this._collectionName;
        const idx = db[collectionName].findIndex(item => Object.keys(query).every(k => item[k] === query[k]));
        if (idx > -1) {
            db[collectionName][idx] = { ...db[collectionName][idx], ...update };
            writeDB(db);
            return db[collectionName][idx];
        }
        return null;
    }
    static async findOneAndDelete(query) {
        const db = readDB();
        const collectionName = this._collectionName;
        const idx = db[collectionName].findIndex(item => Object.keys(query).every(k => item[k] === query[k]));
        if (idx > -1) {
            const deleted = db[collectionName].splice(idx, 1);
            writeDB(db);
            return deleted[0];
        }
        return null;
    }
    async save() {
        const db = readDB();
        const collectionName = this._collection;
        if (!this._id) this._id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
        const idx = db[collectionName].findIndex(item => (item.email && item.email === this.email) || (item._id && item._id === this._id));
        if (idx > -1) db[collectionName][idx] = { ...this };
        else db[collectionName].push({ ...this });
        writeDB(db);
        return this;
    }
}

// ── MONGOOSE MODELS ──
let User, Portfolio, ChatMessage, WeeklyPlan, SavedSOW, LearnerProgress;

if (USE_MONGO) {
    const userSchema = new mongoose.Schema({
        name: String, email: { type: String, unique: true }, password: { type: String, required: true },
        role: { type: String, default: 'teacher' }, otp: String, isVerified: { type: Boolean, default: false },
        curriculumText: String, curriculumText1: String, curriculumText2: String, school: String, subjects: String,
        subject1: String, subject2: String,
        profileTeacher: String, profileSchool: String,
        profilePicture: String,
        resetOtp: String, resetExpiry: Date
    });
    const portfolioSchema = new mongoose.Schema({
        userEmail: String, studentName: String, projectTitle: String, description: String,
        photos: [String], sharedWith: String, timestamp: { type: Number, default: Date.now }
    });
    const chatSchema = new mongoose.Schema({
        sender: String, text: String, time: String, channel: { type: String, default: 'staff' },
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
        // Legacy fields for backward compatibility
        studentName: String, mathScore: String, englishScore: String, scienceScore: String, rubric: String, remarks: String,
        timestamp: { type: Number, default: Date.now }
    });

    User = mongoose.model('User', userSchema);
    Portfolio = mongoose.model('Portfolio', portfolioSchema);
    ChatMessage = mongoose.model('ChatMessage', chatSchema);
    WeeklyPlan = mongoose.model('WeeklyPlan', planSchema);
    SavedSOW = mongoose.model('SavedSOW', sowSchema);
    LearnerProgress = mongoose.model('LearnerProgress', progressSchema);
} else {
    User = class extends MockModel { constructor(d) { super(d, 'users'); } static get _collectionName() { return 'users'; } };
    Portfolio = class extends MockModel { constructor(d) { super(d, 'portfolios'); } static get _collectionName() { return 'portfolios'; } };
    ChatMessage = class extends MockModel { constructor(d) { super(d, 'messages'); } static get _collectionName() { return 'messages'; } };
    WeeklyPlan = class extends MockModel { constructor(d) { super(d, 'plans'); } static get _collectionName() { return 'plans'; } };
    SavedSOW = class extends MockModel { constructor(d) { super(d, 'sows'); } static get _collectionName() { return 'sows'; } };
    LearnerProgress = class extends MockModel { constructor(d) { super(d, 'progress'); } static get _collectionName() { return 'progress'; } };
}

const connectDB = async () => {
    if (USE_MONGO) {
        try {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('✅  MONGODB CONNECTED: Persistence active on Atlas');
        } catch (err) {
            console.error('❌  MONGODB CONNECTION ERROR:', err.message);
            process.exit(1);
        }
    } else {
        console.warn('⚠️  MONGODB DISCONNECTED: Using Local JSON Database (local_db.json)');
        if (!fs.existsSync(DB_PATH)) writeDB({ users: [], portfolios: [], messages: [], plans: [], sows: [], progress: [] });
    }
};

module.exports = { User, ChatMessage, Portfolio, WeeklyPlan, SavedSOW, LearnerProgress, connectDB };
