import pkg from 'bullmq';
const { Queue, Worker } = pkg;
import IORedis from 'ioredis';

// Setup Valkey/Redis connection
// Update config if needed
const connection = new IORedis({
    maxRetriesPerRequest: null
}); 

// Define the queue
export const fileProcessingQueue = new Queue('file-processing', { connection });

// Removed QueueScheduler - no longer required in BullMQ v5+

// Define the worker to handle multi-file processing
export const fileProcessingWorker = new Worker(
    'file-processing',
    async (job) => {
        try {
            const { processFilesForRAG } = await import('./rag.js');
            const files = job.data.files;

            if (!Array.isArray(files) || files.length === 0) {
                throw new Error('No files provided in job data.');
            }

            await processFilesForRAG(files); // [{ path, mimetype }, ...]
        } catch (err) {
            console.error(`❌ Error in worker job ${job.id}:`, err);
            throw err;
        }
    },
    { connection }
);

// Job success/failure logs
fileProcessingWorker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed.`);
});

fileProcessingWorker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed:`, err);
});
