import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import listingRoutes from './routes/listingRoutes';
import messageRoutes from './routes/messageRoutes';
import assistantRoutes from './routes/assistantRoutes';
import publicSettingsRoutes from './routes/publicSettingsRoutes';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 5000;
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3000';

function parseAllowedOrigins(): string[] {
  const configuredOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ORIGIN,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .flatMap((value) => (value ? value.split(',') : []))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(
    new Set([
      DEFAULT_FRONTEND_ORIGIN,
      'http://127.0.0.1:3000',
      ...configuredOrigins,
    ])
  );
}

function isAllowedDevOrigin(origin: string): boolean {
  try {
    const parsedOrigin = new URL(origin);
    const isHttp = parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:';
    const isFrontendPort = parsedOrigin.port === '3000';
    const isLocalhost =
      parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1';
    const isPrivateLan =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(parsedOrigin.hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsedOrigin.hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(parsedOrigin.hostname);

    return isHttp && isFrontendPort && (isLocalhost || isPrivateLan);
  } catch {
    return false;
  }
}

const allowedOrigins = parseAllowedOrigins();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin) || isAllowedDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'ReMarket API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/public', publicSettingsRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(
    `Accepting requests from ${allowedOrigins.join(', ')} and local dev LAN origins on port 3000`
  );
});
