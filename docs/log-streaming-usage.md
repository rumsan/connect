const es = new EventSource('http://localhost:5653/api/logs/stream');

es.onmessage = (event) => {
const log = JSON.parse(event.data);
// { timestamp, level, context, message }
console.log(`[${log.context}] ${log.message}`);
};

es.onerror = () => console.error('SSE connection lost');
