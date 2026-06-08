import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ path: ".env" });
