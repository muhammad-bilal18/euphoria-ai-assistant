import mongoose, { Document, Schema } from "mongoose";
import { Message, Role } from "../lib/types";

interface ChatHistory extends Document {
    sessionId: string;
    history: Message[];
}

const messageSchema = new Schema<Message>({
    role: {
        type: String,
        enum: Object.values(Role),
        required: true,
    },
    content: {
        type: String,
        required: true,
    }
});

const chatSchema = new Schema<ChatHistory>({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    history: [messageSchema],
});

export const ChatHistory = mongoose.model<ChatHistory>("ChatHistory", chatSchema);