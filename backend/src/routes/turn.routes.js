import { Router } from "express";
import { getTurnCredentials } from "../controllers/turn.controller.js";

const router = Router();

// Public on purpose: guests join meetings without an account and still need
// a relay. Abuse is limited by rate limiting and server-side caching instead.
router.route("/turn-credentials").get(getTurnCredentials)

export default router;
