const axios = require('axios');
const http = require('http');
const puppeteer = require('puppeteer');
const { Client } = require('basic-ftp');
const fs = require('fs/promises');
const express = require('express');
const rateLimit = require('express-rate-limit');
const validUrl = require('valid-url');
const winston = require('winston');
const { uploadToFtp } = require('./uploadFile');

// load .env config
require('dotenv').config();
const { PORT,
    AONE_FTP_HOST, AONE_FTP_USER, AONE_FTP_PASSWORD,
    EASTERN_FTP_HOST, EASTERN_FTP_USER, EASTERN_FTP_PASSWORD,
    BOTTLE_FTP_HOST, BOTTLE_FTP_USER, BOTTLE_FTP_PASSWORD
} = process.env;

const port = PORT || 3000; // Default to port 3000 if no PORT environment variable is set

const app = express();

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);

// Winston logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'user-service' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

function fetchDataFromApi(url) {
    return axios.get(url)
        .then(response => response.data)
        .catch(error => {
            throw error;
        });
}

app.get('/', async function (req, res) {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});

    const url = new URL(req.url, `http://${req.headers.host}`)
    const path = url.searchParams.get('path');
    
    //https://gpnvhv0l-3000.asse.devtunnels.ms/?url=https%3A%2F%2Fbottle.com.hk%2Fpdf%2Fquotation%2F676797.html&path=pdf/quotation/20191154

    const fileUrl = url.searchParams.get('url');
    logger.info(`path: ${path}`);
    logger.info(`fileUrl: ${fileUrl}`);
    
    if (!path || !fileUrl) {
        res.end(JSON.stringify({ success: 0, error: 'No path or url provided' }));
        return;
    }

    // Validate the URL
    if (fileUrl && !validUrl.isWebUri(fileUrl)) {
        res.end(JSON.stringify({ success: 0, error: 'Invalid URL provided' }));
        return;
    }

    // Validate the path
    if (path && !/^[a-zA-Z0-9_\-\/]+$/.test(path)) {
        res.end(JSON.stringify({ success: 0, error: 'Invalid path provided' }));
        return;
    }
    
    try {
        let html;
        const ftpSetting = getFTPSettings(fileUrl);
        if (path) {
            const dirPath = path.split('/').slice(0, -1).join('/');
            if (dirPath) {
                try {
                    await fs.mkdir(dirPath, { recursive: true });
                } catch (err) {
                    if (err.code !== 'EEXIST') {
                        throw err;
                    }
                }
            }
        }
        if (fileUrl) {
            html = await loadFileFromUrl(decodeURI(fileUrl));
            // save html to file
            await fs.writeFile(path + '.html', html);
        } else {
            html = await fs.readFile(path + '.html', 'utf8');
        }

        if (!html) {
            res.end(JSON.stringify({ success: 0, error: 'No HTML content found' }));
            return;
        }

        await handleHtml(html, path, ftpSetting, res);
    } catch (error) {
        logger.error(`Error: ${error.message}`);
        res.end(JSON.stringify({ success: 0, error: error.message }));
    }
});

const server = app.listen(port);
app.on('error', onError);
app.on('listening', onListening);

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string'
        ? 'Pipe ' + port
        : 'Port ' + port;

    switch (error.code) {
        case 'EACCES':
            logger.error(`${bind} requires elevated privileges`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            logger.error(`${bind} is already in use`);
            process.exit(1);
            break;
        default:
            throw error;
    }
}

function onListening() {
    var addr = app.address();
    var bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    logger.info(`Listening on ${bind}`);
}

const genericPool = require('generic-pool');

const browserPool = genericPool.createPool({
    create: async () => {
        return puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    },
    destroy: async (browser) => {
        await browser.close();
    }
}, {
    max: 5,
    min: 1
});

async function handleHtml(html, path, ftpSetting, res) {
    let browser, page;
    let startTime, endTime;
    try {
        startTime = Date.now(); // Record the start time
        browser = await browserPool.acquire();
        page = await browser.newPage();
        
        // Set viewport for better rendering
        await page.setViewport({
            width: 1200,
            height: 1600,
            deviceScaleFactor: 2
        });

        // Enable both JavaScript and request interception
        await page.setJavaScriptEnabled(true);

        // Set content with proper wait until
        await page.setContent(html, {
            waitUntil: ['load', 'domcontentloaded', 'networkidle0']
        });

        // Add extra wait to ensure images are loaded
        await page.evaluate(async () => {
            const selectors = Array.from(document.getElementsByTagName('img'));
            await Promise.all(selectors.map(img => {
                if (img.complete) return;
                return new Promise((resolve, reject) => {
                    img.addEventListener('load', resolve);
                    img.addEventListener('error', reject);
                });
            }));
        });

        // Generate PDF with optimized settings
        await page.pdf({
            path: path + '.pdf',
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: {
                top: '20px',
                right: '20px',
                bottom: '20px',
                left: '20px'
            }
        });
        endTime = Date.now(); // Record the end time
        const duration = (endTime - startTime) / 1000; // Convert milliseconds to seconds
        logger.info(`PDF generate completed in ${duration} seconds`);

        if (ftpSetting) {
            await uploadToFtp(ftpSetting, path + '.pdf');
        }

        res.end(JSON.stringify({ success: 1 }));
    } catch (error) {
        logger.error(`PDF generation error: ${error.message}`);
        res.end(JSON.stringify({ success: 0, error: error.message }));
    } finally {
        if (page) {
            await page.close();
        }
        if (browser) {
            await browserPool.release(browser);
        }
        // Cleanup temporary files
        await cleanupFiles(path);
    }
}

async function loadFileFromUrl(url) {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        logger.error(`Error loading URL: ${error.message}`);
        return null;
    }
}

function getFTPSettings(url) {
    if (url) {
        const host = url.split('/')[2];
        logger.info(`getFTPSettings host: ${host}`);
        switch (host) {
            case AONE_FTP_HOST:
                return {
                    host: AONE_FTP_HOST,
                    port: 21,
                    user: AONE_FTP_USER,
                    password: AONE_FTP_PASSWORD,
                    homePath: '/domains/aoneshop.com.hk/public_html/'
                };
            case EASTERN_FTP_HOST:
                return {
                    host: EASTERN_FTP_HOST,
                    port: 21,
                    user: EASTERN_FTP_USER,
                    password: EASTERN_FTP_PASSWORD,
                    homePath: '/domains/hk-eastern.com/public_html/'
                };
            case BOTTLE_FTP_HOST:
                return {
                    host: BOTTLE_FTP_HOST,
                    port: 21,
                    user: BOTTLE_FTP_USER,
                    password: BOTTLE_FTP_PASSWORD,
                    homePath: '/domains/bottle.com.hk/public_html/'
                };
            default:
                return null;
        }
    }
    return null;
}

async function cleanupFiles(path) {
    try {
        await fs.unlink(path + '.html');
        await fs.unlink(path + '.pdf');
        logger.info(`Cleaned up temporary files: ${path}.html, ${path}.pdf`);
    } catch (error) {
        logger.error(`Error cleaning up temporary files: ${error.message}`);
    }
}

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}, stack: ${reason.stack}`);
});

process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}, stack: ${err.stack}`);
    process.exit(1);
});

process.on('SIGTERM', async () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });

    // Close all browsers in the pool
    for (const browser of browserPool) {
        await browser.close();
    }
    browserPool.length = 0; // Clear the pool
});