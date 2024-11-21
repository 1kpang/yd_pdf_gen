const axios = require('axios');
const http = require('http');
var pdf = require('html-pdf');
const { Client } = require('basic-ftp');
const fs = require('fs');

const port = process.env.PORT || 3000; // Default to port 3000 if no PORT environment variable is set
// const port = 8020;

function fetchDataFromApi(url) {
    return axios.get(url)
        .then(response => response.data)
        .catch(error => {
            throw error;
        });
}

var server = http.createServer(async function (req, res) {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});

    // var message = '新華行(香港)有限公司 It works!\n' + new Date().toString() + '\n',
    //     version = 'NodeJS ' + process.versions.node + '\n',
    //     response = [message, version].join('\n');
    // res.end('PDF generate success: ' + JSON.stringify(response));

    const url = new URL(req.url, `http://${req.headers.host}`)
    // console.log(url);

    //https://gpnvhv0l-3000.asse.devtunnels.ms/?url=https%3A%2F%2Fbottle.com.hk%2Fpdf%2Fquotation%2F676797.html&path=pdf/quotation/20191154

    //http://bottle.com.hk/node0811?path=pdf/quotation/20191154
    //http://www.bottle.com.hk/node0811/test/quotation.html
    //http://www.bottle.com.hk/node0811/quotation.pdf
    var path = url.searchParams.get('path');
    var fileUrl = url.searchParams.get('url');
    console.log('path: ' + path);
    console.log('fileUrl: ' + fileUrl);
    if (path || fileUrl) {
        if (path) {
            //create directory if not exists
            fs.mkdirSync( path, { recursive: true });
        }
        if (fileUrl) {
            loadFileFromUrl(decodeURI(fileUrl)).then(function(html){
                if(html) {
                    console.log('html size: ' + html.length);
                    const ftpSetting = getFTPSettings(fileUrl);
                    handleHtml(html, path, ftpSetting, res);
                } else {
                    res.end();
                }
            });
        } else if (path) {
            var html = fs.readFileSync('../' + url.searchParams.get('path') + '.html', 'utf8');
            if(html) {
                handleHtml(html, path, ftpSetting, res);
            } else {
                res.end();
            }
        }
    } else {
        res.end();
    }
});
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string'
        ? 'Pipe ' + port
        : 'Port ' + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

function onListening() {
    var addr = server.address();
    var bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    console.log('Listening on ' + bind);
}

function handleHtml(html, path, ftpSetting, res) {
    var options = {
        format: "A4",
        orientation: "portrait",
        timeout: 180000,
        localUrlAccess: false,
        base: 'https://bottle.com.hk'
    }; // , "width": "210mm", "height": "296mm" //, "phantomPath": "./npm/phantomjs-prebuilt/bin/phantomjs"

    let result = {
        success: 0
    };
    pdf.create(html, options).toFile(path + '.pdf', async function (err, response) {
        if (err) {
            console.log('pdf create failed');
            console.error(err);
            result.success = 0;
            res.end(JSON.stringify(result));
        } else {
            console.log('pdf create success');
            console.log(response);
            await uploadToFtp(ftpSetting, path + '.pdf');
            // res.end('PDF generate success: ' + JSON.stringify(response));
            result.success = 1;
            res.end(JSON.stringify(result));
        }
    });
}

function loadFileFromUrl(url) {
    return new Promise(function (resolve, reject) {
        var request = require('request');
        request.get(url, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                resolve(body);
            } else {
                reject(error);
            }
        });
    });
}

function loadFileFromUrl(url) {
    return fetchDataFromApi(url).then(function (response) {
        if (response) {
            return response;
        } else {
            console.error('Error fetching data from API:', url);
            return null;
        }
    })
    .catch(error => {
        console.error('Error fetching data from API:', error);
        return null;
    });
}

async function uploadToFtp(ftpSetting, local_file_path) {
    if (ftpSetting) {
        console.log('ftpSetting:', ftpSetting);
        console.log('local_file_path:', local_file_path);

        const ftp_file_path = ftpSetting.homePath + local_file_path;
        console.log('ftp_file_path:', ftp_file_path);

        const client = new Client();

        try {
            await client.access({
                host: ftpSetting.host,
                user: ftpSetting.user,
                password: ftpSetting.password,
                secure: false
            });
            console.log('Connected to', ftpSetting.host, 'for user', ftpSetting.user);
    
            // Upload the file to the FTP server
            await client.uploadFrom(local_file_path, ftp_file_path);
            console.log('Uploaded HTML content to', ftp_file_path);
        } catch (err) {
            console.error('FTP operation has failed:', err);
        } finally {
            client.close();
        }
    }
}

function getFTPSettings(url) {
    if (url) {
        const host = url.split('/')[2];
        console.log('getFTPSettings host:', host);
        switch (host) {
            case 'aoneshop.com.hk':
                return {
                    host: 'aoneshop.com.hk',
                    port: 21,
                    user: 'aoneshopco',
                    password: 'aoneeasternFN9115',
                    homePath: '/domains/aoneshop.com.hk/public_html/'
                };
            case 'hk-eastern.com':
                return {
                    host: 'hk-eastern.com',
                    port: 21,
                    user: 'hkeasternc',
                    password: 'aoneeasternFN9115',
                    homePath: '/domains/hk-eastern.com/public_html/'
                };
            case 'bottle.com.hk':
                return {
                    host: 'bottle.com.hk',
                    port: 21,
                    user: 'bottlecomb',
                    password: 'Funnyjoke1127',
                    homePath: '/domains/bottle.com.hk/public_html/'
                };
            default:
                return null;
        }
    }
    return null;
}
