import { Router, Request, Response } from 'express';
import { chatWithEuphoria } from '../usecases/chatWithEuphoria';
import { Message, Role } from '../lib/types';
import { ChatHistory } from '../model/chatHistory';

const router = Router();

let history: Message[] = [];
let currentSession: string = '';

router.post('/', async (req: Request, res: Response) => {
    try {
        const { question, sessionId } = req.body;
        if (!question) {
            res.status(400).send({ message: 'Question is required!' });
            return;
        }
        
        if (!sessionId) {
            res.status(400).send({ message: 'Session id is required!' });
            return;
        }

        if (currentSession !== sessionId) {
            const currentHistory = await ChatHistory.findOne({ sessionId }).select('history');
            if (currentHistory) {
                history = currentHistory.history;
                currentSession = sessionId;
            }
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

        await ChatHistory.updateOne({ sessionId }, { $set: { history } }, { upsert: true });
        res.end();

    } catch (error) {
        console.error('Error in chat with documents:', error);
        res.status(500).send({ message: 'Something went wrong, try again later' });
    }
});

export default router;