var http = require('http');
var server = http.createServer(async function (req, res) {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});

    // var message = '新華行(香港)有限公司 It works!\n' + new Date().toString() + '\n',
    //     version = 'NodeJS ' + process.versions.node + '\n',
    //     response = [message, version].join('\n');

    const url = new URL(req.url, `http://${req.headers.host}`)
    // console.log(url);

    //http://bottle.com.hk/node0811?path=pdf/quotation/20191154
    //http://www.bottle.com.hk/node0811/test/quotation.html
    //http://www.bottle.com.hk/node0811/quotation.pdf
    var thePath = url.searchParams.get('path');
    var paths = thePath.split('/');
    var path = paths[0]; // html path
    var fileUrl = url.searchParams.get('url');
    if (path || fileUrl) {
        var fs = require('fs');
        if (fileUrl) {
            loadFileFromUrl(decodeURI(fileUrl)).then(function(html){
                if(html) {
                    handleHtml(html, paths, res);
                } else {
                    res.end();
                }
            });
        } else if (path) {
            var html = fs.readFileSync('../' + url.searchParams.get('path') + '.html', 'utf8');
            if(html) {
                handleHtml(html, paths, res);
            } else {
                res.end();
            }
        }
    } else {
        res.end();
    }
});
server.listen();
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
``
function handleHtml(html, paths, res) {
    var pdf = require('html-pdf');
    const PDFMerger = require('pdf-merger-js');

    var options = {
        format: "A4",
        orientation: "portrait",
        timeout: 180000,
        localUrlAccess: false,
        base: 'http://bottle.com.hk'
    }; // , "width": "210mm", "height": "296mm" //, "phantomPath": "./npm/phantomjs-prebuilt/bin/phantomjs"

    let result = {
        success: 0
    };
    let destPath = '../' + paths[0] + '.pdf';
    pdf.create(html, options).toFile(destPath, function (err, response) {
        if (err) {
            console.log(err);
            result.success = 0;
            res.end(JSON.stringify(result));
        } else {
            console.log(response);
            // res.end('PDF generate success: ' + JSON.stringify(response));
            if (paths.length > 1) {
                var merger = new PDFMerger();
                (async () => {
                    merger.add(destPath); 
                    merger.add(destPath); 
                    merger.add(destPath); 
                    for (var i = 1; i < paths.length; i++) {
                        merger.add(paths[i]); // merge other pdf files
                    }
                    await merger.save(destPath); //save under given name and reset the internal document

                    result.success = 1;
                    res.end(JSON.stringify(result));
                })();
            }
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
