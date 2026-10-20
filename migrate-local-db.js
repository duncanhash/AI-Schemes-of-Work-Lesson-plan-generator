const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const mongoose = require('mongoose');
const {
    User,
    ChatMessage,
    Portfolio,
    WeeklyPlan,
    SavedSOW,
    LearnerProgress,
    connectDB
} = require('./db');

const sourcePath = path.join(__dirname, 'local_db.json');
const applyChanges = process.argv.includes('--apply');

const collections = [
    { source: 'users', model: User, uniqueBy: 'email' },
    { source: 'portfolios', model: Portfolio },
    { source: 'messages', model: ChatMessage },
    { source: 'plans', model: WeeklyPlan, uniqueBy: 'userEmail' },
    { source: 'sows', model: SavedSOW },
    { source: 'progress', model: LearnerProgress }
];

function cleanRecord(record) {
    const { _id, _collection, ...data } = record;
    return data;
}

function stableObjectId(collectionName, record) {
    const sourceId = record._id == null ? JSON.stringify(cleanRecord(record)) : String(record._id);
    const hash = crypto.createHash('sha256').update(`${collectionName}:${sourceId}`).digest('hex').slice(0, 24);
    return new mongoose.Types.ObjectId(hash);
}

function getUniqueFilter(collection, record) {
    if (collection.uniqueBy === 'email') {
        if (!record.email) throw new Error('A local user record is missing its email.');
        record.email = record.email.toLowerCase();
        return { email: record.email };
    }
    if (collection.uniqueBy === 'userEmail') {
        if (!record.userEmail) throw new Error('A local planner record is missing its userEmail.');
        record.userEmail = record.userEmail.toLowerCase();
        return { userEmail: record.userEmail };
    }
    return { _id: stableObjectId(collection.source, record) };
}

async function main() {
    if (!fs.existsSync(sourcePath)) {
        throw new Error('local_db.json was not found. Run this command on the machine that has the local database file.');
    }

    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const migrationPlan = collections.map(collection => {
        const records = source[collection.source] || [];
        if (!Array.isArray(records)) throw new Error(`The ${collection.source} entry must be an array.`);
        return { ...collection, records };
    });

    console.log(`${applyChanges ? 'Applying' : 'Dry run'}: local_db.json to MongoDB`);
    migrationPlan.forEach(collection => {
        console.log(`${collection.source}: ${collection.records.length} record(s) -> ${collection.model.collection.collectionName}`);
    });

    if (!applyChanges) {
        console.log('No records were written. Run with --apply to migrate.');
        return;
    }

    await connectDB();
    for (const collection of migrationPlan) {
        let inserted = 0;
        let alreadyPresent = 0;

        for (let index = 0; index < collection.records.length; index += 1) {
            const sourceRecord = collection.records[index];
            if (!sourceRecord || typeof sourceRecord !== 'object' || Array.isArray(sourceRecord)) {
                throw new Error(`Invalid record in ${collection.source} at index ${index}.`);
            }

            const document = cleanRecord(sourceRecord);
            const filter = getUniqueFilter(collection, document);
            if (!collection.uniqueBy) document._id = filter._id;

            const result = await collection.model.updateOne(
                filter,
                { $setOnInsert: document },
                { upsert: true, setDefaultsOnInsert: true, runValidators: true }
            );
            if (result.upsertedCount) inserted += 1;
            else alreadyPresent += 1;
        }

        console.log(`${collection.source}: inserted ${inserted}, already present ${alreadyPresent}`);
    }
}

main()
    .catch(error => {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
