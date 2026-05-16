const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'local_db.json');

function readDB() {
    if (!fs.existsSync(DB_PATH)) return { users: [], portfolios: [], messages: [], plans: [] };
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

        // Mock chainable methods for chat and portfolio
        results.sort = () => {
            results.reverse();
            results.limit = () => results;
            return results;
        };
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

    async save() {
        const db = readDB();
        const collectionName = this._collection;
        const pk = collectionName === 'users' ? 'email' : (collectionName === 'plans' ? 'userEmail' : null);
        
        if (!this._id) this._id = Date.now().toString() + Math.random().toString(36).substring(2, 7);

        if (pk) {
            const idx = db[collectionName].findIndex(item => item[pk] === this[pk]);
            if (idx > -1) db[collectionName][idx] = { ...this };
            else db[collectionName].push({ ...this });
        } else {
            const idx = this._id ? db[collectionName].findIndex(item => item._id === this._id) : -1;
            if (idx > -1) db[collectionName][idx] = { ...this };
            else db[collectionName].push({ ...this });
        }
        writeDB(db);
        return this;
    }
}

class User extends MockModel {
    constructor(data) { super(data, 'users'); }
    static get _collectionName() { return 'users'; }
}

class Portfolio extends MockModel {
    constructor(data) { super(data, 'portfolios'); }
    static get _collectionName() { return 'portfolios'; }
}

class ChatMessage extends MockModel {
    constructor(data) { super(data, 'messages'); }
    static get _collectionName() { return 'messages'; }
}

class WeeklyPlan extends MockModel {
    constructor(data) { super(data, 'plans'); }
    static get _collectionName() { return 'plans'; }
}

const connectDB = async () => {
    console.warn('⚠️  MONGODB DISCONNECTED: Using Local JSON Database (local_db.json)');
    if (!fs.existsSync(DB_PATH)) writeDB({ users: [], portfolios: [], messages: [], plans: [] });
};

module.exports = { User, ChatMessage, Portfolio, WeeklyPlan, connectDB };
