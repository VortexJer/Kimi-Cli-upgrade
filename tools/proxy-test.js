const http = require('http');
const net = require('net');
const url = require('url');

const PORT = 18080;
let requestCount = 0;
let connectCount = 0;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

const server = http.createServer((req, res) => {
  requestCount++;
  log('HTTP REQUEST', req.method, req.url);
  log('Headers:', JSON.stringify(req.headers, null, 2));
  res.writeHead(502, { 'Content-Type': 'text/plain' });
  res.end('Proxy test server: HTTP request intercepted\n');
});

server.on('connect', (req, clientSocket, head) => {
  connectCount++;
  log('CONNECT', req.url);
  log('Headers:', JSON.stringify(req.headers, null, 2));

  const { hostname, port } = url.parse(`http://${req.url}`);
  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    log('Server socket error:', err.message);
    clientSocket.end();
  });
});

server.listen(PORT, () => {
  log(`Proxy test server listening on port ${PORT}`);
  log('Set HTTPS_PROXY=http://localhost:' + PORT + ' before running kimi');
});

setInterval(() => {
  log(`Stats: ${requestCount} HTTP requests, ${connectCount} CONNECT tunnels`);
}, 5000);

process.on('SIGINT', () => {
  log('Shutting down...');
  server.close();
  process.exit(0);
});
