import mongoose from "mongoose";


export const connectDB = async () => {
    const MONGODB_URI = process.env.MONGODB_URI!;

    try {
        await mongoose.connect(MONGODB_URI);
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1);
    }
};