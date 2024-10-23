import { createClient } from 'redis';


export const getRedisClient = async () => {
    const client = createClient({
        url: process.env.REDIS_URL!
    });
    client.on('error', err => console.log('Redis Client Error', err));
    await client.connect();
    return client;
}