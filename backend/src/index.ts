import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';

import chatRoutes from './api/chat.route';
import modelsRoutes from './api/models.route';
import systemRoutes from './api/system.route';
import keysRoutes from './api/keys.route';
import v1ModelsRoutes from './api/v1/models.route';
import v1ChatRoutes from './api/v1/chat.route';
import { initDb } from './db/init';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(clerkMiddleware());

app.use('/api', chatRoutes);
app.use('/api', modelsRoutes);
app.use('/api', systemRoutes);
app.use('/api', keysRoutes);
app.use('/api/v1', v1ModelsRoutes);
app.use('/api/v1', v1ChatRoutes);

initDb();

app.listen(PORT, () => {
  console.log(`Agent backend server running on http://localhost:${PORT}`);
});
