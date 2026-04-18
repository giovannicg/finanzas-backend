import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';

import authRouter from './routes/auth';
import transactionsRouter from './routes/transactions';
import alertsRouter from './routes/alerts';
import categoriesRouter from './routes/categories';
import usersRouter from './routes/users';
import webhookRouter from './routes/webhook';
import logsRouter from './routes/logs';
import apiTokensRouter from './routes/apiTokens';
import { requestLogger } from './middleware/requestLogger';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(express.urlencoded({ extended: true }));

// SendGrid Inbound Parse sends multipart/form-data
const upload = multer();
app.use('/api/webhook', upload.none(), webhookRouter);

app.use('/api/auth', authRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/logs', logsRouter);
app.use('/api/tokens', apiTokensRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
