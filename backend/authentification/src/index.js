import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes.js';
import redis from './config/redis.js';
import { initCronJobs } from './utils/cronJobs.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(helmet());
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://doctor.localhost:3000',
    'http://staff.localhost:3000',
    'http://doctor.myapp.local:3000',
    'http://staff.myapp.local:3000',
    'http://api.myapp.local:5000'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 🔥 START SERVER + CONNECT REDIS
async function startServer() {
    try {
        await redis.connect();  // ✅ Connect Redis here
        console.log("Redis connected");

        // Initialize cron jobs
        initCronJobs();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(` Auth service running on port ${PORT}`);
        });

    } catch (error) {
        console.error("Redis connection failed:", error);
        process.exit(1);
    }
}

startServer();