import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import chatRoutes from './api/chat.route';
import modelsRoutes from './api/models.route';
import systemRoutes from './api/system.route';
import keysRoutes from './api/keys.route';
import { initDb } from './db/init';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', chatRoutes);
app.use('/api', modelsRoutes);
app.use('/api', systemRoutes);
app.use('/api', keysRoutes);

initDb();

app.listen(PORT, () => {
  console.log(`Agent backend server running on http://localhost:${PORT}`);
});
