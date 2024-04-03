var http = require('http');
var server = http.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    var message = '新華行(香港)有限公司 It works!\n' + new Date().toString() + '\n',
        version = 'NodeJS ' + process.versions.node + '\n',
        response = [message, version].join('\n');

    var fs = require('fs');
    var pdf = require('html-pdf');
    var html = fs.readFileSync('./test/quotation.html', 'utf8');
    var options = { format: 'A4', orientation: 'portrait', timeout: 180000 };

    pdf.create(html, options).toFile('./quotation.pdf', function(err, res) {
      if (err) return console.log(err);
      console.log(res); // { filename: '/app/businesscard.pdf' }

    });
    res.end(response);
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
