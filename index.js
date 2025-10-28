import dotenv from "dotenv";

// Load environment early so other modules see process.env during import
dotenv.config();

// Start the actual server module
import "./server.js";
