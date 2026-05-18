/**
 * Pedagogy Database User Manager Utility
 * Usage: 
 *   node manage-users.js list
 *   node manage-users.js set-role <email> <role> (role: teacher / parent)
 */

require('dotenv').config();
const { User, connectDB } = require('./db');
const mongoose = require('mongoose');

async function run() {
    console.log("==========================================");
    console.log("  PEDAGOGY DATABASE USER MANAGER CLIENT   ");
    console.log("==========================================\n");

    // Establish Connection
    await connectDB();

    const args = process.argv.slice(2);
    const command = args[0] ? args[0].toLowerCase() : 'help';

    try {
        if (command === 'list') {
            console.log("\nFetching registered accounts...\n");
            const users = await User.find({});
            if (!users || users.length === 0) {
                console.log("No accounts found in database.");
            } else {
                console.log(String("").padEnd(45, "-"));
                console.log(`${"Name".padEnd(20)} | ${"Email".padEnd(30)} | ${"Role".padEnd(12)} | ${"Verified"}`);
                console.log(String("").padEnd(45, "-"));
                users.forEach(u => {
                    const role = u.role || 'teacher';
                    const verified = u.isVerified ? '✅ Yes' : '❌ No';
                    console.log(`${(u.name || 'N/A').padEnd(20)} | ${(u.email || '').padEnd(30)} | ${role.padEnd(12)} | ${verified}`);
                });
                console.log(String("").padEnd(45, "-"));
                console.log(`Total Accounts: ${users.length}\n`);
            }
        } 
        else if (command === 'set-role') {
            const email = args[1] ? args[1].toLowerCase() : null;
            const role = args[2] ? args[2].toLowerCase() : null;

            if (!email || !role) {
                console.log("❌ Error: Missing parameters.");
                console.log("Usage: node manage-users.js set-role <email> <role>");
                console.log("Example: node manage-users.js set-role njoroge@test.com parent");
                process.exit(1);
            }

            if (role !== 'teacher' && role !== 'parent') {
                console.log("❌ Error: Invalid role. Role must be either 'teacher' or 'parent'.");
                process.exit(1);
            }

            const user = await User.findOne({ email });
            if (!user) {
                console.log(`❌ Error: Account with email '${email}' not found.`);
                process.exit(1);
            }

            user.role = role;
            await user.save();
            console.log(`\n🎉 Success! Updated ${email}'s role to: '${role.toUpperCase()}'`);
        } 
        else if (command === 'add') {
            const name = args[1];
            const email = args[2] ? args[2].toLowerCase() : null;
            const password = args[3];
            const role = args[4] ? args[4].toLowerCase() : 'teacher';

            if (!name || !email || !password) {
                console.log("❌ Error: Missing parameters.");
                console.log("Usage: node manage-users.js add <name> <email> <password> [role]");
                console.log("Example: node manage-users.js add \"Jane Doe\" jane@gmail.com pass123 teacher");
                process.exit(1);
            }

            if (role !== 'teacher' && role !== 'parent') {
                console.log("❌ Error: Invalid role. Role must be 'teacher' or 'parent'.");
                process.exit(1);
            }

            const existingUser = await User.findOne({ email });
            if (existingUser) {
                console.log(`❌ Error: Account with email '${email}' already exists.`);
                process.exit(1);
            }

            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = new User({
                name,
                email,
                password: hashedPassword,
                role: role,
                isVerified: true
            });

            await newUser.save();
            console.log(`\n🎉 Success! Added verified user '${name}' (${email}) as a '${role.toUpperCase()}'!`);
        }
        else if (command === 'delete') {
            const email = args[1] ? args[1].toLowerCase() : null;

            if (!email) {
                console.log("❌ Error: Missing email parameter.");
                console.log("Usage: node manage-users.js delete <email>");
                process.exit(1);
            }

            const deleted = await User.findOneAndDelete({ email });
            if (!deleted) {
                console.log(`❌ Error: Account with email '${email}' not found.`);
                process.exit(1);
            }

            console.log(`\n🎉 Success! Deleted user account '${email}' from the database.`);
        }
        else {
            console.log("Available Commands:");
            console.log("  node manage-users.js list                      List all registered users and roles");
            console.log("  node manage-users.js set-role <email> <role>   Set role ('teacher' or 'parent') for an email");
            console.log("  node manage-users.js add <name> <email> <pwd> [role]  Add a new pre-verified user to the system");
            console.log("  node manage-users.js delete <email>            Delete a user account entirely");
            console.log("\nExamples:");
            console.log("  node manage-users.js set-role teacher@gmail.com teacher");
            console.log("  node manage-users.js add \"Njoroge\" nj@gmail.com pass123 teacher");
            console.log("  node manage-users.js delete parent@gmail.com");
        }
    } catch (e) {
        console.error("❌ Operations Error:", e.message);
    } finally {
        // Disconnect if mongoose is active
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        process.exit(0);
    }
}

run();
