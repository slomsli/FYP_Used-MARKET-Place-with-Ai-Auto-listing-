import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 5000;

/* ── Security ───────────────────────────────────────────── */

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);

/* ── Rate-limiting for auth endpoints ───────────────────── */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // 20 requests per window per IP
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ── Body parsing ───────────────────────────────────────── */

app.use(express.json({ limit: '20mb' }));

/* ── Routes ─────────────────────────────────────────────── */

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Used Marketplace API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/dashboard', dashboardRoutes);

/* ── Error handler (must be last) ───────────────────────── */

app.use(errorHandler);

/* ── Start ──────────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`✓ Backend server running on http://localhost:${PORT}`);
  console.log(`✓ Accepting requests from ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});
