import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';

// --- CONFIGURE HERE ---
const TELEGRAM_BOT_TOKEN = 'bot8542981210:AAF1tKSU1EZb-5YwEafSTJEd_tqIcRKQJrw';
const FIXED_CHAT_ID = 2141064153;
const KIEAI_API_KEY = '713300857dcc1eabc93c589150d663a2';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.onText(/(.+)/, async (msg, match) => {
  const userPrompt = match[1];

  // Only respond to your specific chat ID:
  if (msg.chat.id !== FIXED_CHAT_ID) {
    bot.sendMessage(msg.chat.id, 'Sorry, this bot only works for its owner.');
    return;
  }

  bot.sendMessage(FIXED_CHAT_ID, 'Got your prompt! Generating video... ⏳');

  try {
    // Start task
    const taskRes = await axios.post(
      'https://api.kie.ai/api/v1/jobs/createTask',
      {
        model: 'grok-imagine/image-to-video',
        input: {
          prompt: userPrompt,
          mode: 'normal'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${KIEAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (taskRes.data?.code !== 200) {
      throw new Error(taskRes.data?.message || "Failed to start generation");
    }
    const taskId = taskRes.data.data.taskId;

    // Poll for result
    let status = null, resultUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(res => setTimeout(res, 5000));
      const statusRes = await axios.get(`https://api.kie.ai/api/v1/jobs/queryTask?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${KIEAI_API_KEY}` }
      });
      if (statusRes.data?.data?.state === 'success') {
        status = 'success';
        const resultJson = JSON.parse(statusRes.data.data.resultJson);
        resultUrl = resultJson?.resultUrls?.[0];
        break;
      } else if (statusRes.data?.data?.state === 'fail') {
        status = 'fail';
        break;
      }
    }

    if (status === 'success' && resultUrl) {
      if (/\.(mp4|mov|webm)$/.test(resultUrl)) {
        bot.sendVideo(FIXED_CHAT_ID, resultUrl, { caption: 'Here is your generated video!' });
      } else {
        bot.sendMessage(FIXED_CHAT_ID, `✅ Video generated!\n[Click here to watch/download](${resultUrl})`, { parse_mode: 'Markdown' });
      }
    } else {
      bot.sendMessage(FIXED_CHAT_ID, 'Failed to generate video or it is taking too long. Please try again.');
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(FIXED_CHAT_ID, `Error: ${err.message || err}`);
  }
});
