import { Router, Request, Response } from 'express';
import { chatWithEuphoria } from '../usecases/chatWithEuphoria';
import { Message } from '../lib/types';

const router = Router();

const history: Message[] = [];

router.post('/', async (req: Request, res: Response) => {
    try {
        const { question } = req.body;
        if (!question) {
            res.status(400).send({ message: 'Question is required!' });
            return;
        }

        if (history.length === 10) {
            history.splice(0, 2);
        }

        history.push({ role: 'user', content: question as string });

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
        history.push({ role: 'assistant', content: answer });
        res.end();

    } catch (error) {
        console.error('Error in chat with documents:', error);
        res.status(500).send({ message: 'Something went wrong, try again later' });
    }
});

export default router;