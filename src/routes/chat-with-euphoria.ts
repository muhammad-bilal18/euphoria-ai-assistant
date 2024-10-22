import { Router, Request, Response } from 'express';
import { chatWithEuphoria } from '../usecases/chatWithEuphoria';
import { Message, Role } from '../lib/types';
import { ChatHistory } from '../model/chatHistory';
import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from '../lib/redisClient';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const { question } = req.body;
        let sessionId = req.cookies.sessionId;
        if (!sessionId) {
            sessionId = uuidv4();
            res.cookie('sessionId', sessionId, { httpOnly: true, secure: true });
        }
        if (!question) {
            res.status(400).send({ message: 'Question is required!' });
            return;
        }

        const client = await getRedisClient();
        let history: Message[] = await JSON.parse((await client.get(sessionId))!);

        if (!history) {
            const currentHistory = await ChatHistory.findOne({ sessionId }).select('history');
            history = currentHistory?.history as Message[] || [];
        }
        history.push({ role: Role.USER, content: question as string });

        const stream = await chatWithEuphoria(question, history, 'docx', 'src/documents/my-qa.docx');            
        const [logStream] = stream.tee();
        const logReader = logStream.getReader();
        let answer = '';
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Transfer-Encoding', 'chunked');
        while (true) {
            const { done, value } = await logReader.read();
            if (done) break;
            if (value.answer) {
                res.write(value.answer);
                answer += value.answer;
            }
        }
        history.push({ role: Role.ASSISTANT, content: answer });
        await client.set(sessionId, JSON.stringify(history), { EX: 10 });
        await ChatHistory.updateOne({ sessionId: sessionId }, { $set: { history } }, { upsert: true });
        res.end();

    } catch (error) {
        console.error('Error in chat with documents:', error);
        res.status(500).send({ message: 'Something went wrong, try again later' });
    }
});

export default router;