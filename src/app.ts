import express from 'express';
import { config } from "dotenv";
import chat_with_euphoria from './routes/chat-with-euphoria';
import cors from 'cors';
import { connectDB } from './lib/db';

config();

const app = express();
app.use(express.json())
app.use(cors({ origin: '*' }));
const PORT = process.env.PORT!;

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
})

app.use('/chat-with-euphoria', chat_with_euphoria);

app.listen(PORT, async () => {
  console.log('server listening on port', PORT);
  await connectDB();
})