import httpStatus from "http-status";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt"

import crypto from "crypto"
import { Meeting } from "../models/meeting.model.js";

// Single failure shape for every handler. The real exception is logged
// server-side; the client only ever sees a safe message.
const fail = (res, status, message) => res.status(status).json({ message });

const isBlank = (value) => typeof value !== "string" || value.trim() === "";

const login = async (req, res) => {

    const { username, password } = req.body;

    if (isBlank(username) || isBlank(password)) {
        return fail(res, httpStatus.BAD_REQUEST, "Username and password are required")
    }

    try {
        const user = await User.findOne({ username });

        // Same response for "no such user" and "wrong password" so the
        // endpoint can't be used to discover which usernames exist.
        if (!user) {
            return fail(res, httpStatus.UNAUTHORIZED, "Invalid username or password")
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password)

        if (!isPasswordCorrect) {
            return fail(res, httpStatus.UNAUTHORIZED, "Invalid username or password")
        }

        const token = crypto.randomBytes(20).toString("hex");

        user.token = token;
        await user.save();
        return res.status(httpStatus.OK).json({ token: token })

    } catch (e) {
        console.error("login failed:", e.message);
        return fail(res, httpStatus.INTERNAL_SERVER_ERROR, "Something went wrong. Please try again.")
    }
}


const register = async (req, res) => {
    const { name, username, password } = req.body;

    if (isBlank(name) || isBlank(username) || isBlank(password)) {
        return fail(res, httpStatus.BAD_REQUEST, "Name, username and password are required")
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return fail(res, httpStatus.CONFLICT, "That username is already taken");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name,
            username: username,
            password: hashedPassword
        });

        await newUser.save();

        return res.status(httpStatus.CREATED).json({ message: "User Registered" })

    } catch (e) {
        // The unique index can still reject a duplicate that slipped past
        // the findOne check above if two registrations race.
        if (e.code === 11000) {
            return fail(res, httpStatus.CONFLICT, "That username is already taken");
        }
        console.error("register failed:", e.message);
        return fail(res, httpStatus.INTERNAL_SERVER_ERROR, "Something went wrong. Please try again.")
    }

}


const getUserHistory = async (req, res) => {
    const { token } = req.query;

    if (isBlank(token)) {
        return fail(res, httpStatus.UNAUTHORIZED, "Authentication required")
    }

    try {
        const user = await User.findOne({ token: token });
        if (!user) {
            return fail(res, httpStatus.UNAUTHORIZED, "Invalid or expired session")
        }

        const meetings = await Meeting.find({ user_id: user.username })
        return res.status(httpStatus.OK).json(meetings)
    } catch (e) {
        console.error("getUserHistory failed:", e.message);
        return fail(res, httpStatus.INTERNAL_SERVER_ERROR, "Could not load meeting history")
    }
}

const addToHistory = async (req, res) => {
    const { token, meeting_code } = req.body;

    if (isBlank(token)) {
        return fail(res, httpStatus.UNAUTHORIZED, "Authentication required")
    }

    // 400 here is correct — the caller is authenticated, the payload is malformed
    if (isBlank(meeting_code)) {
        return fail(res, httpStatus.BAD_REQUEST, "Meeting code is required")
    }

    try {
        const user = await User.findOne({ token: token });
        if (!user) {
            return fail(res, httpStatus.UNAUTHORIZED, "Invalid or expired session")
        }

        const newMeeting = new Meeting({
            user_id: user.username,
            meetingCode: meeting_code
        })

        await newMeeting.save();

        return res.status(httpStatus.CREATED).json({ message: "Added code to history" })
    } catch (e) {
        console.error("addToHistory failed:", e.message);
        return fail(res, httpStatus.INTERNAL_SERVER_ERROR, "Could not save to meeting history")
    }
}


export { login, register, getUserHistory, addToHistory }
