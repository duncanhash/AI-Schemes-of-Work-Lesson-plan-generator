const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function list() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const models = await genAI.getGenerativeModel({ model: "gemini-pro" }); // Dummy to check connection
        // The SDK doesn't have a direct listModels, we usually check docs or trial/error
        // But we can try to generate with gemini-1.5-flash-latest
        console.log("Testing gemini-pro...");
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hi");
        console.log("Success with gemini-pro!");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e.message);
        process.exit(1);
    }
}
list();
