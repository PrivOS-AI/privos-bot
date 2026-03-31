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
} = process.env;

const PRIVOS_BOT_USER_ID = PRIVOS_BOT_TOKEN?.split('_')[1];
const BOT_HEADERS = { Authorization: `Bearer ${PRIVOS_BOT_TOKEN}`, 'Content-Type': 'application/json' };
const EDIT_INTERVAL_MS = 800;      // legacy editMessage cadence
const CHUNK_INTERVAL_MS = 150;     // streaming API cadence (no DB write per chunk)
const WORD_DELAY_MS = 60; // delay between each word for streaming effect

// ~2000-word song lyrics for streaming test
const SONG_LYRICS = `Bài Ca Của Những Dòng Code

Trong ánh sáng xanh của màn hình đêm khuya
Những dòng code chảy như suối trong rừng già
Mỗi ký tự là một nốt nhạc vang xa
Kể câu chuyện về thế giới số không ngừng nghỉ

Verse 1: Khởi Đầu

Ngày đầu tiên con học viết dòng code
Hello World hiện lên trên terminal
Niềm vui nhỏ nhưng mà lớn lao vô cùng
Như đứa trẻ lần đầu cất tiếng nói

Từng biến số được khai báo cẩn thận
Từng hàm được viết với bao tâm huyết
If else switch case vòng lặp for while
Những viên gạch đầu tiên xây nên tòa lâu đài

Đêm khuya ngồi debug tìm lỗi sai
Semicolon thiếu một dấu nhỏ thôi
Mà chương trình crash như bão cuốn phăng đi
Kiên nhẫn thôi vì code không phụ người chăm chỉ

Chorus:

Code ơi code ơi hãy chạy đi
Qua từng server qua từng API
Streaming data như dòng sông chảy mãi
Kết nối thế giới bằng những bit và byte

Code ơi code ơi hãy bay cao
Vượt qua firewall vượt qua mọi rào
Deploy lên cloud như chim trời tung cánh
Mang đến người dùng niềm vui mỗi ngày

Verse 2: Thử Thách

Có những ngày bug nhiều như lá mùa thu
Stack overflow chất đống trong console
Memory leak chảy âm thầm không biết
Cho đến khi server sập vì quá tải

Production down lúc ba giờ sáng khuya
Alert phone kêu liên hồi không dứt
On call engineer mắt nhắm mắt mở
Ssh vào server tay run vì lạnh

Hotfix deploy mà không kịp viết test
Pray và push rồi ngồi chờ đợi kết quả
Green checkmark hiện lên trên CI CD
Thở phào nhẹ nhõm rồi lại ngủ tiếp

Nhưng sáng hôm sau lại bug mới xuất hiện
Regression test fail đỏ lòm một dãy
Tech lead họp khẩn cấp cả team vào phòng
Root cause analysis bắt đầu lại từ đầu

Bridge:

Đôi khi muốn bỏ cuộc quăng laptop đi
Chuyển nghề bán phở hay đi trồng rau sạch
Nhưng rồi lại ngồi xuống mở IDE
Vì đam mê code chảy trong huyết quản

Mỗi dòng code là một lời thì thầm
Nói với máy tính hãy làm điều kỳ diệu
Biến ý tưởng thành sản phẩm thật sự
Chạm đến hàng triệu người trên khắp năm châu

Verse 3: Trưởng Thành

Từ junior dev ngây ngô thuở nào
Giờ đã thành senior với bao kinh nghiệm
Code review PR với mắt tinh tường
Mentoring fresher như ngày xưa được dạy

Architecture design vẽ trên whiteboard
Microservices message queue event driven
Kubernetes Docker container orchestration
Scalable system handle triệu request mỗi giây

Database design normalization index
Query optimization explain analyze
Caching strategy Redis Memcached
Performance tuning từng millisecond một

Security audit penetration testing
OWASP top ten SQL injection XSS
Authentication authorization OAuth JWT
Bảo vệ dữ liệu người dùng là trên hết

Chorus 2:

Code ơi code ơi hãy sáng lên
Như ngọn đuốc giữa đêm đen dẫn lối
Open source community chia sẻ yêu thương
Cùng nhau xây dựng tương lai tốt đẹp hơn

Code ơi code ơi hãy vang xa
Từ Việt Nam ra khắp thế giới bao la
Vietnamese developers tài năng không kém
Góp phần tạo nên những sản phẩm tuyệt vời

Verse 4: AI Và Tương Lai

Rồi AI đến thay đổi mọi thứ
Machine learning deep learning neural network
GPT Claude Gemini đua nhau ra đời
Copilot gợi ý code nhanh như chớp

Có người lo sợ AI thay thế developer
Nhưng ta tin rằng AI chỉ là công cụ
Như búa như kìm trong tay người thợ giỏi
Sức mạnh nằm ở người sử dụng nó

Prompt engineering trở thành kỹ năng mới
Fine tuning model cho từng use case riêng
RAG vector database embedding search
Kết hợp AI với domain expertise

Agentic AI tự động hóa workflow
Code review testing deployment tự động
Nhưng vẫn cần con người đưa ra quyết định
Sáng tạo và đạo đức không thể automate

Verse 5: Tình Yêu Và Code

Coder cũng biết yêu đừng có nghĩ khác
Tình yêu của coder cũng đẹp như bao người
Chỉ là thay vì tặng hoa tặng chocolate
Thì viết cho em một cái app xinh xinh

Valentine commit message ghi rằng
Fix bug trong tim anh khi thiếu em
Merge request tình yêu chờ em approve
Conflict resolve bằng nụ hôn ngọt ngào

Date night hai đứa ngồi cùng code
Em frontend anh backend perfect match
API tình yêu endpoint là trái tim
Response always return status two hundred OK

Khi cãi nhau thì rollback lại commit cũ
Khi giận nhau thì force push một cái
Nhưng rồi lại rebase về cùng branch
Vì tình yêu của mình không thể fork

Verse 6: Cộng Đồng Developer

Meetup conference hackathon cuối tuần
Developer Việt Nam tụ họp chia sẻ
Từ Hà Nội Sài Gòn Đà Nẵng Huế
Đam mê công nghệ kết nối mọi người

Stack Overflow câu hỏi và câu trả lời
GitHub star fork contribute pull request
Dev dot to blog chia sẻ kiến thức
Twitter X thread viral về clean code

Mentor mentee relationship quý giá
Senior dìu dắt junior từng bước
Không phải cạnh tranh mà là cùng phát triển
Rising tide lifts all boats như người ta nói

Open source project đóng góp miễn phí
Vì tin rằng knowledge should be free
Collaboration không biên giới quốc gia
Một pull request có thể đến từ bất kỳ đâu

Verse 7: Những Đêm Không Ngủ

Hai giờ sáng coffee đã nguội lạnh
Đôi mắt mỏi nhưng tay vẫn gõ phím
Deadline ngày mai không thể delay thêm
Sprint review sáng mai phải demo được

Feature flag bật lên test trên staging
QA team ping liên tục trên Slack
Found a bug severity critical
Lại ngồi xuống fix thêm một vòng nữa

Unit test integration test e2e
Coverage phải đạt tám mươi phần trăm
Mocking stubbing spy assertion
Green green green all tests passed finally

Push code lên rồi tạo pull request
Reviewer comment chỉnh sửa thêm chút
Approve merge vào develop branch
Tomorrow we deploy to production

Verse 8: Triết Lý Code

Clean code không chỉ là code chạy được
Mà là code người khác đọc hiểu ngay
Variable naming có ý nghĩa rõ ràng
Function nhỏ gọn làm một việc duy nhất

SOLID principles năm nguyên tắc vàng
Single responsibility mỗi class một nhiệm vụ
Open closed mở rộng không sửa đổi
Liskov substitution thay thế được nhau

Interface segregation tách nhỏ interface
Dependency inversion phụ thuộc abstraction
Design patterns giải pháp cho vấn đề quen
Factory observer strategy command

DRY dont repeat yourself nguyên tắc cơ bản
KISS keep it simple stupid đừng phức tạp
YAGNI you aint gonna need it đừng làm thừa
Premature optimization is the root of all evil

Verse 9: DevOps Và Infrastructure

Terraform ansible puppet chef
Infrastructure as code quản lý hạ tầng
CI CD pipeline automate everything
From commit to production trong vài phút

Monitoring alerting observability
Prometheus Grafana dashboard đẹp lung linh
Log aggregation ELK stack hay Loki
Tracing distributed system với Jaeger

Incident response runbook đã sẵn sàng
PagerDuty alert escalation policy
Postmortem blameless culture không đổ lỗi
Learn from failure và improve continuously

SLA SLO SLI đo lường service
Uptime ninety nine point nine percent
Redundancy failover disaster recovery
Vì downtime cost money và trust của user

Verse 10: Lời Kết

Code không chỉ là nghề để kiếm tiền
Code là nghệ thuật là đam mê là sáng tạo
Mỗi developer đều là nghệ sĩ
Vẽ nên thế giới bằng những dòng lệnh

Từ startup nhỏ đến big tech corporation
Từ freelancer đến CTO giám đốc
Tất cả đều bắt đầu từ dòng code đầu tiên
Hello World câu chào thay đổi cuộc đời

Final Chorus:

Code ơi code ơi cảm ơn người
Đã cho ta nghề nghiệp và niềm vui
Đã kết nối những tâm hồn đồng điệu
Cùng nhau kiến tạo tương lai tươi sáng

Code ơi code ơi ta yêu người
Dù bug nhiều dù stress dù mệt mỏi
Nhưng mỗi khi deploy thành công lên prod
Nụ cười lại nở trên môi developer

Outro:

Và cứ thế dòng code vẫn chảy mãi
Từ thế hệ này sang thế hệ khác
Ngôn ngữ thay đổi framework ra đi
Nhưng tinh thần lập trình sẽ còn mãi mãi

Git commit dash m chấm hết bài ca
Push origin main branch cuối cùng
Và khi bạn đọc được những dòng này
Nghĩa là streaming đã hoạt động thành công rồi đó

Cảm ơn bạn đã lắng nghe bài hát này
Một bài hát được stream từng chữ một
Không có AI không có LLM nào cả
Chỉ có text thuần túy và tình yêu code

Hết.`;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), mode: 'no-llm' });
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
  console.log(`[bot] ${senderName}: "${message.msg.substring(0, 80)}"`);
  console.log(`[bot] Mode: NO-LLM — streaming song lyrics word by word`);

  await setTyping(roomId, true);

  try {
    await streamSongLyrics(roomId);
  } catch (err) {
    console.error('[stream] Error:', err.message);
    await sendMessage(roomId, 'Sorry, an error occurred while streaming.');
  } finally {
    await setTyping(roomId, false);
  }
}

async function streamSongLyrics(roomId) {
  // Try streaming API first — falls back to legacy editMessage if unavailable
  const streamingSession = await startStreaming(roomId);
  const useStreamingAPI = streamingSession !== null;
  const streamingMessageId = streamingSession?.messageId ?? null;

  if (useStreamingAPI) {
    console.log(`[bot] Streaming API mode, messageId=${streamingMessageId}`);
  } else {
    console.log(`[bot] Legacy editMessage mode (streaming API unavailable)`);
  }

  const words = SONG_LYRICS.split(/(\s+)/); // split but keep whitespace
  let accumulated = '';

  // Legacy mode state
  let legacyMessageId = null;
  let lastEditTime = 0;

  // Streaming mode state — track how much has been sent to compute deltas
  let lastSentLength = 0;
  let lastChunkTime = 0;

  for (let i = 0; i < words.length; i++) {
    accumulated += words[i];
    const isLast = i === words.length - 1;
    const now = Date.now();

    if (useStreamingAPI) {
      const timeSinceChunk = now - lastChunkTime;
      // Send delta chunk every CHUNK_INTERVAL_MS or on last word
      if (timeSinceChunk >= CHUNK_INTERVAL_MS || isLast) {
        const delta = accumulated.substring(lastSentLength);
        if (delta) {
          try {
            if (isLast) {
              // Final call — end the stream with the complete text
              await endStreaming(streamingMessageId, accumulated);
              console.log(`[stream] END ok (${accumulated.length}ch total)`);
            } else {
              await streamChunk(streamingMessageId, delta);
              console.log(`[stream] CHUNK ok (${delta.length}ch delta)`);
            }
            lastSentLength = accumulated.length;
            lastChunkTime = Date.now();
          } catch (err) {
            console.error('[stream] Chunk error:', err.message);
          }
        }
      }
    } else {
      const timeSinceLastEdit = now - lastEditTime;
      // Flush to Privos every EDIT_INTERVAL_MS or on last word
      if (timeSinceLastEdit >= EDIT_INTERVAL_MS || isLast) {
        try {
          if (!legacyMessageId) {
            const result = await sendMessage(roomId, accumulated);
            legacyMessageId = result.messageId || result.message?._id || result.message?.id;
            console.log(`[stream] SEND ok, msgId=${legacyMessageId} (${accumulated.length}ch)`);
          } else {
            await editMessage(legacyMessageId, accumulated);
            console.log(`[stream] EDIT ok (${accumulated.length}ch)`);
          }
          lastEditTime = Date.now();
        } catch (err) {
          console.error('[stream] Edit/send error:', err.message);
        }
      }
    }

    // Delay between words for streaming effect
    await sleep(WORD_DELAY_MS);
  }

  console.log(`[bot] Stream complete (${accumulated.length} chars, ${words.length} tokens)`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  console.log(`[privos-bot] NO-LLM mode — streaming song lyrics`);
  console.log(`[privos-bot] Webhook server on port ${PORT}`);
  await registerWebhook();
});
