import "dotenv/config";
import express from "express";
import { createServer } from "node:http";

import mongoose from "mongoose";
import { connectToSocket } from "./controllers/socketManager.js";

import cors from "cors";
import userRoutes from "./routes/users.routes.js";

const app = express();
const server = createServer(app);

// Attaches the Socket.IO signaling layer to the same HTTP server
connectToSocket(server);


app.set("port", (process.env.PORT || 8000))
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false
}));
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

app.use("/api/v1/users", userRoutes);

const start = async () => {
    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is not set. Add it to backend/.env — see backend/.env.example.");
        process.exit(1);
    }

    let connectionDb;
    try {
        connectionDb = await mongoose.connect(process.env.MONGO_URI);
    } catch (e) {
        // Print only the message — never the URI, which contains credentials.
        console.error("Failed to connect to MongoDB. Check MONGO_URI in backend/.env.");
        console.error(`Reason: ${e.message}`);
        process.exit(1);
    }

    console.log(`MongoDB connected — host: ${connectionDb.connection.host}`)

    const port = app.get("port");
    server.listen(port, () => {
        console.log(`Server listening on port ${port}`)
    });
}

start();
