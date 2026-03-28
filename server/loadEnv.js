import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
console.log('--- ENV AUDIT ---');
console.log('ROOT .env path:', '../.env');
console.log('VITE_FRONTEND_URL:', process.env.VITE_FRONTEND_URL);
console.log('-----------------');
