import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import chatRoutes from './api/chat.route';
import modelsRoutes from './api/models.route';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', chatRoutes);
app.use('/api', modelsRoutes);

app.listen(PORT, () => {
  console.log(`Agent backend server running on http://localhost:${PORT}`);
});
