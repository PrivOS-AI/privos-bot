require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

const {
  PORT = 10002,
  PRIVOS_URL,
  PRIVOS_BOT_TOKEN,
  PRIVOS_WEBHOOK_SECRET,
  WEBHOOK_URL,
  TVIBE_URL,
  TVIBE_API_KEY,
} = process.env;

const PRIVOS_BOT_USER_ID = PRIVOS_BOT_TOKEN?.split('_')[1];
const BOT_HEADERS = { Authorization: `Bearer ${PRIVOS_BOT_TOKEN}`, 'Content-Type': 'application/json' };
const EDIT_INTERVAL_MS = 800;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/webhook', (req, res) => {
  const secret = req.headers['x-privos-bot-api-secret-token'];
  if (PRIVOS_WEBHOOK_SECRET && secret !== PRIVOS_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, room, message } = req.body;
  console.log(`[webhook] event=${event} room=${room?.id} sender=${message?.username}`);

  if (event !== 'message.new') return res.sendStatus(200);
  if (message?.userId === PRIVOS_BOT_USER_ID) return res.sendStatus(200);
  if (!message?.msg) return res.sendStatus(200);

  res.sendStatus(200);
  handleMessage(room, message).catch((err) => console.error('[handleMessage]', err.message));
});

async function handleMessage(room, message) {
  const roomId = room.id;
  const senderName = message.name || message.username || 'Unknown';
  const roomName = room.type === 'd' ? senderName : (room.name || senderName);
  const projectName = `Chat with ${roomName}`;

  console.log(`[bot] ${senderName}: "${message.msg.substring(0, 80)}"`);

  await setTyping(roomId, true);

  try {
    await streamAndReply({ prompt: message.msg, roomId, projectName });
  } catch (err) {
    console.error('[stream] Error:', err.message);
    await sendMessage(roomId, 'Sorry, an error occurred while generating the response.');
  } finally {
    await setTyping(roomId, false);
  }
}

// Single POST that returns SSE stream — no race condition
async function streamAndReply({ prompt, roomId, projectName }) {
  const res = await fetch(`${TVIBE_URL}/api/attempts`, {
    method: 'POST',
    headers: { 'x-api-key': TVIBE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      force_create: true,
      projectId: roomId,
      projectName,
      taskId: roomId,
      taskTitle: projectName,
      projectRootPath: `/tmp/privos-bot/${roomId}`,
      request_method: 'stream',
    }),
  });
  if (!res.ok) throw new Error(`TVibe ${res.status}: ${await res.text()}`);

  let accumulated = '';
  let statusText = ''; // tool activity indicator
  let messageId = null;
  let flushChain = Promise.resolve();
  let flushTimer = null;

  const TOOL_ICONS = {
    WebSearch: '🔍', WebFetch: '🌐', Read: '📄', Write: '✏️', Edit: '✏️',
    Bash: '⚙️', Grep: '🔎', Glob: '📁', Agent: '🤖', default: '🔧',
  };

  const flushEdit = () => {
    flushChain = flushChain.then(async () => {
      const display = accumulated || statusText;
      if (!display) return;
      console.log(`[flush] msgId=${messageId} accumulated=${accumulated.length}ch status="${statusText.substring(0,50)}"`);
      try {
        if (!messageId) {
          const result = await sendMessage(roomId, display);
          messageId = result.messageId || result.message?._id || result.message?.id;
          console.log(`[flush] SEND ok, msgId=${messageId}`);
          if (!messageId) console.error('[privos] No messageId in response:', JSON.stringify(result).substring(0, 300));
        } else {
          await editMessage(messageId, display);
          console.log(`[flush] EDIT ok, ${display.length}ch`);
        }
      } catch (err) {
        console.error('[privos] Edit error:', err.message);
      }
    });
    return flushChain;
  };

  const scheduleEdit = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushEdit();
    }, EDIT_INTERVAL_MS);
  };

  return new Promise((resolve, reject) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    function processChunk(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let eventType = 'message';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          try {
            handleSSEEvent(eventType, JSON.parse(line.slice(6)));
          } catch {}
          eventType = 'message';
        }
      }
    }

    function toolSummary(input) {
      const hint = input?.query || input?.command || input?.pattern || input?.prompt
        || input?.url || input?.description || input?.file_path || '';
      return String(hint).substring(0, 100);
    }

    function handleSSEEvent(eventType, data) {
      console.log(`[sse] event=${eventType} type=${data.type} subtype=${data.subtype||''}`);
      if (eventType === 'done') {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        flushEdit().then(async () => {
          await setTyping(roomId, false);
          if (!accumulated) {
            await sendMessage(roomId, 'I received your message but could not generate a response.');
          }
          console.log(`[bot] Stream complete (${accumulated.length} chars)`);
          resolve();
        });
        return;
      }

      // Streaming tool_use start — show tool activity immediately
      if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
        const block = data.content_block;
        const icon = TOOL_ICONS[block.name] || TOOL_ICONS.default;
        const hint = toolSummary(block.input);
        statusText = `${icon} **${block.name}**${hint ? `: ${hint}` : ''}`;
        if (!accumulated) scheduleEdit();
        return;
      }

      // Streaming text deltas — append incrementally
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta.text) {
        accumulated += data.delta.text;
        scheduleEdit();
        return;
      }

      // Full assistant message — extract text + show tool activity
      if (data.type === 'assistant' && data.message?.content) {
        const content = data.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              const icon = TOOL_ICONS[block.name] || TOOL_ICONS.default;
              const hint = toolSummary(block.input);
              statusText = `${icon} **${block.name}**${hint ? `: ${hint}` : ''}`;
              if (!accumulated) scheduleEdit();
            }
          }
          const text = content.filter(b => b.type === 'text').map(b => b.text || '').join('');
          if (text) {
            accumulated = text;
            statusText = '';
            scheduleEdit();
          }
        } else if (typeof content === 'string' && content) {
          accumulated = content;
          statusText = '';
          scheduleEdit();
        }
      }
    }

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          flushEdit().then(async () => {
            await setTyping(roomId, false);
            resolve();
          });
          return;
        }
        processChunk(decoder.decode(value, { stream: true }));
        read();
      }).catch(reject);
    }

    read();
  });
}

// --- Privos API helpers ---

async function sendMessage(roomId, text) {
  const res = await fetch(`${PRIVOS_URL}/api/v1/bot/sendMessage`, {
    method: 'POST',
    headers: BOT_HEADERS,
    body: JSON.stringify({ roomId, text }),
  });
  if (!res.ok) throw new Error(`Privos send ${res.status}: ${await res.text()}`);
  return res.json();
}

async function editMessage(messageId, text) {
  const res = await fetch(`${PRIVOS_URL}/api/v1/bot.editMessage`, {
    method: 'POST',
    headers: BOT_HEADERS,
    body: JSON.stringify({ messageId, text }),
  });
  if (!res.ok) throw new Error(`Privos edit ${res.status}: ${await res.text()}`);
  return res.json();
}

async function setTyping(roomId, isTyping) {
  try {
    await fetch(`${PRIVOS_URL}/api/v1/bot/setTypingStatus`, {
      method: 'POST',
      headers: BOT_HEADERS,
      body: JSON.stringify({ roomId, isTyping }),
    });
  } catch (err) {
    console.error('[privos] Typing error:', err.message);
  }
}

async function registerWebhook() {
  const url = WEBHOOK_URL || `http://localhost:${PORT}/webhook`;
  console.log(`[webhook] Registering: ${url}`);
  const res = await fetch(`${PRIVOS_URL}/api/v1/bot/setWebhook`, {
    method: 'POST',
    headers: BOT_HEADERS,
    body: JSON.stringify({ url, events: ['message.new'] }),
  });
  const data = await res.json();
  if (res.ok) {
    console.log(`[webhook] Registered OK (id=${data.webhook?.id})`);
    if (data.webhook?.secret) process.env.PRIVOS_WEBHOOK_SECRET = data.webhook.secret;
  } else {
    console.error(`[webhook] Registration failed: ${JSON.stringify(data)}`);
  }
}

app.listen(PORT, async () => {
  console.log(`[privos-bot] Webhook server on port ${PORT}`);
  await registerWebhook();
});
