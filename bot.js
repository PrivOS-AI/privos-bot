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
let PRIVOS_BOT_USERNAME = null; // fetched on startup
const BOT_HEADERS = { Authorization: `Bearer ${PRIVOS_BOT_TOKEN}`, 'Content-Type': 'application/json' };
const EDIT_INTERVAL_MS = 800;      // legacy editMessage cadence
const CHUNK_INTERVAL_MS = 150;     // streaming API cadence (no DB write per chunk)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/webhook', (req, res) => {
  const secret = req.headers['x-privos-bot-api-secret-token'];
  if (PRIVOS_WEBHOOK_SECRET && secret !== PRIVOS_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, room, message, bot } = req.body;
  console.log(`[webhook] event=${event} room=${room?.id} type=${room?.type} sender=${message?.username} bot=${bot?.username}`);

  if (event !== 'message.new') return res.sendStatus(200);
  if (message?.userId === PRIVOS_BOT_USER_ID) return res.sendStatus(200);
  if (!message?.msg) return res.sendStatus(200);

  // Learn bot username from webhook payload
  if (bot?.username && !PRIVOS_BOT_USERNAME) {
    PRIVOS_BOT_USERNAME = bot.username;
    console.log(`[bot] Learned username: @${PRIVOS_BOT_USERNAME}`);
  }

  // In group rooms (channels/groups), only reply when bot is @mentioned in text
  if (room?.type !== 'd' && PRIVOS_BOT_USERNAME) {
    const mentionPattern = new RegExp(`@${PRIVOS_BOT_USERNAME}\\b`, 'i');
    if (!mentionPattern.test(message.msg || message.text || '')) {
      console.log(`[webhook] Skipping group message (bot @${PRIVOS_BOT_USERNAME} not in: "${(message.msg || message.text || '').substring(0, 80)}")`);
      return res.sendStatus(200);
    }
  }

  res.sendStatus(200);
  handleMessage(room, message).catch((err) => console.error('[handleMessage]', err.message));
});

async function handleMessage(room, message) {
  const roomId = room.id;
  const senderName = message.name || message.username || 'Unknown';
  const roomName = room.type === 'd' ? senderName : (room.name || senderName);
  const projectName = `Chat with ${roomName}`;

  // Strip bot @mention from the prompt so LLM gets clean text
  let prompt = message.msg;
  if (PRIVOS_BOT_USERNAME) {
    prompt = prompt.replace(new RegExp(`@${PRIVOS_BOT_USERNAME}\\b`, 'gi'), '').trim();
  }
  if (!prompt) prompt = 'Hello';

  console.log(`[bot] ${senderName}: "${prompt.substring(0, 80)}"`);

  await setTyping(roomId, true);

  try {
    await streamAndReply({ prompt, roomId, projectName });
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

  // Try streaming API — returns null if unavailable (404 / network error)
  const streamingSession = await startStreaming(roomId);
  const useStreamingAPI = streamingSession !== null;
  const streamingMessageId = streamingSession?.messageId ?? null;

  if (useStreamingAPI) {
    console.log(`[bot] Streaming API mode, messageId=${streamingMessageId}`);
  } else {
    console.log(`[bot] Legacy editMessage mode (streaming API unavailable)`);
  }

  let accumulated = '';
  let statusText = ''; // tool activity indicator

  // --- Legacy mode state ---
  let legacyMessageId = null;
  let flushChain = Promise.resolve();
  let flushTimer = null;

  // --- Streaming mode state ---
  let lastSentLength = 0;
  let chunkTimer = null;

  const TOOL_ICONS = {
    WebSearch: '🔍', WebFetch: '🌐', Read: '📄', Write: '✏️', Edit: '✏️',
    Bash: '⚙️', Grep: '🔎', Glob: '📁', Agent: '🤖', default: '🔧',
  };

  // ---- Legacy flush helpers ----

  const flushEdit = () => {
    flushChain = flushChain.then(async () => {
      const display = accumulated || statusText;
      if (!display) return;
      console.log(`[flush] msgId=${legacyMessageId} accumulated=${accumulated.length}ch status="${statusText.substring(0, 50)}"`);
      try {
        if (!legacyMessageId) {
          const result = await sendMessage(roomId, display);
          legacyMessageId = result.messageId || result.message?._id || result.message?.id;
          console.log(`[flush] SEND ok, msgId=${legacyMessageId}`);
          if (!legacyMessageId) console.error('[privos] No messageId in response:', JSON.stringify(result).substring(0, 300));
        } else {
          await editMessage(legacyMessageId, display);
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

  // ---- Streaming API chunk helpers ----

  const flushChunk = async () => {
    const delta = accumulated.substring(lastSentLength);
    if (!delta && !statusText) return;

    if (delta) {
      // Send only the new delta text
      await streamChunk(streamingMessageId, delta).catch((err) =>
        console.error('[stream] Chunk error:', err.message)
      );
      console.log(`[chunk] sent ${delta.length}ch delta`);
      lastSentLength = accumulated.length;
    } else if (statusText && lastSentLength === 0) {
      // No text yet but there is a tool status — send it as a chunk
      await streamChunk(streamingMessageId, statusText).catch((err) =>
        console.error('[stream] Status chunk error:', err.message)
      );
      console.log(`[chunk] sent status: "${statusText.substring(0, 50)}"`);
    }
  };

  const scheduleChunk = () => {
    if (chunkTimer) return;
    chunkTimer = setTimeout(async () => {
      chunkTimer = null;
      await flushChunk();
    }, CHUNK_INTERVAL_MS);
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
      console.log(`[sse] event=${eventType} type=${data.type} subtype=${data.subtype || ''}`);

      if (eventType === 'done') {
        if (useStreamingAPI) {
          if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; }
          // Flush any remaining delta then end the stream
          endStreaming(streamingMessageId, accumulated)
            .catch((err) => console.error('[stream] endStreaming error:', err.message))
            .then(async () => {
              await setTyping(roomId, false);
              if (!accumulated) {
                // No text was ever accumulated — send a fallback message
                await sendMessage(roomId, 'I received your message but could not generate a response.')
                  .catch((err) => console.error('[privos] Fallback send error:', err.message));
              }
              console.log(`[bot] Stream complete (${accumulated.length} chars)`);
              resolve();
            });
        } else {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          flushEdit().then(async () => {
            await setTyping(roomId, false);
            if (!accumulated) {
              await sendMessage(roomId, 'I received your message but could not generate a response.');
            }
            console.log(`[bot] Stream complete (${accumulated.length} chars)`);
            resolve();
          });
        }
        return;
      }

      // Streaming tool_use start — show tool activity immediately
      if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
        const block = data.content_block;
        const icon = TOOL_ICONS[block.name] || TOOL_ICONS.default;
        const hint = toolSummary(block.input);
        statusText = `${icon} **${block.name}**${hint ? `: ${hint}` : ''}`;
        if (useStreamingAPI) {
          if (!accumulated) scheduleChunk();
        } else {
          if (!accumulated) scheduleEdit();
        }
        return;
      }

      // Streaming text deltas — append incrementally
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta.text) {
        accumulated += data.delta.text;
        if (useStreamingAPI) {
          scheduleChunk();
        } else {
          scheduleEdit();
        }
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
              if (useStreamingAPI) {
                if (!accumulated) scheduleChunk();
              } else {
                if (!accumulated) scheduleEdit();
              }
            }
          }
          const text = content.filter(b => b.type === 'text').map(b => b.text || '').join('');
          if (text) {
            accumulated = text;
            statusText = '';
            if (useStreamingAPI) {
              scheduleChunk();
            } else {
              scheduleEdit();
            }
          }
        } else if (typeof content === 'string' && content) {
          accumulated = content;
          statusText = '';
          if (useStreamingAPI) {
            scheduleChunk();
          } else {
            scheduleEdit();
          }
        }
      }
    }

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          if (useStreamingAPI) {
            if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; }
            endStreaming(streamingMessageId, accumulated)
              .catch((err) => console.error('[stream] endStreaming error:', err.message))
              .then(async () => {
                await setTyping(roomId, false);
                resolve();
              });
          } else {
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
            flushEdit().then(async () => {
              await setTyping(roomId, false);
              resolve();
            });
          }
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

// Returns { messageId } on success, null if streaming API unavailable (404 / error)
async function startStreaming(roomId) {
  try {
    const res = await fetch(`${PRIVOS_URL}/api/v1/bot/startStreaming`, {
      method: 'POST',
      headers: BOT_HEADERS,
      body: JSON.stringify({ roomId }),
    });
    if (!res.ok) return null; // fallback signal
    return res.json();
  } catch {
    return null;
  }
}

async function streamChunk(messageId, text) {
  await fetch(`${PRIVOS_URL}/api/v1/bot/streamChunk`, {
    method: 'POST',
    headers: BOT_HEADERS,
    body: JSON.stringify({ messageId, text }),
  });
}

async function endStreaming(messageId, text) {
  await fetch(`${PRIVOS_URL}/api/v1/bot/endStreaming`, {
    method: 'POST',
    headers: BOT_HEADERS,
    body: JSON.stringify({ messageId, text }),
  });
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
