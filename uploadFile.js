// ftpUpload.js
const { Client } = require('basic-ftp');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'ftp-upload' },
    transports: [
        new winston.transports.File({ filename: 'ftp-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'ftp-combined.log' }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

async function uploadToFtp(ftpSetting, local_file_path) {
    if (ftpSetting) {
        logger.info(`ftpSetting: ${JSON.stringify(ftpSetting)}`);
        logger.info(`local_file_path: ${local_file_path}`);

        const ftp_file_path = ftpSetting.homePath + local_file_path;
        logger.info(`ftp_file_path: ${ftp_file_path}`);

        const client = new Client();
        let startTime, endTime;

        try {
            startTime = Date.now(); // Record the start time

            await client.access({
                host: ftpSetting.host,
                user: ftpSetting.user,
                password: ftpSetting.password,
                secure: false
            });
            logger.info(`Connected to ${ftpSetting.host} for user ${ftpSetting.user}`);
    
            // Upload the file to the FTP server
            await client.uploadFrom(local_file_path, ftp_file_path);
            logger.info(`Uploaded HTML content to ${ftp_file_path}`);

            endTime = Date.now(); // Record the end time
            const duration = (endTime - startTime) / 1000; // Convert milliseconds to seconds
            logger.info(`FTP upload completed in ${duration} seconds`);
        } catch (err) {
            logger.error(`FTP operation has failed: ${err.message}`);
        } finally {
            client.close();
        }
    }
}

module.exports = { uploadToFtp };