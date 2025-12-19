import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';

const TELEGRAM_BOT_TOKEN = '8542981210:AAF1tKSU1EZb-5YwEafSTJEd_tqIcRKQJrw';
const FIXED_CHAT_ID = 2141064153;
const KIEAI_API_KEY = '713300857dcc1eabc93c589150d663a2';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.onText(/(.+)/, async (msg, match) => {
  const userPrompt = match[1];

  if (msg.chat.id !== FIXED_CHAT_ID) {
    bot.sendMessage(msg.chat.id, 'Sorry, this bot only works for its owner.');
    return;
  }

  bot.sendMessage(FIXED_CHAT_ID, 'Got your prompt! Generating video... ⏳');

  try {
    // -- Compose payload for text-to-video only --
    const payload = {
      model: 'grok-imagine/image-to-video',
      input: {
        prompt: userPrompt,
        mode: 'normal'
      }
    };

    const createTaskUrl = 'https://api.kie.ai/api/v1/jobs/createTask';

    console.log('[DEBUG] POST', createTaskUrl, JSON.stringify(payload, null, 2));

    const taskRes = await axios.post(
      createTaskUrl,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${KIEAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[DEBUG] Kie.ai response:', JSON.stringify(taskRes.data, null, 2));

    if (taskRes.data?.code !== 200 || !taskRes.data?.data?.taskId) {
      // Inform you in Telegram of the *actual issue* from Kie.ai API:
      bot.sendMessage(FIXED_CHAT_ID, `Kie.ai error: ${JSON.stringify(taskRes.data, null, 2)}`);
      throw new Error(taskRes.data?.message || "Failed to start generation");
    }
    const taskId = taskRes.data.data.taskId;

    // -- Poll for result as before --
    let status = null, resultUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(res => setTimeout(res, 5000));
      const queryTaskUrl = `https://api.kie.ai/api/v1/jobs/queryTask?taskId=${taskId}`;
      console.log('[DEBUG] GET', queryTaskUrl);

      let statusRes;
      try {
        statusRes = await axios.get(queryTaskUrl, {
          headers: { 'Authorization': `Bearer ${KIEAI_API_KEY}` }
        });
      } catch (err) {
        if (err.response && err.response.status === 404) {
          console.error('[DEBUG] QueryTask 404:', queryTaskUrl);
          continue;
        } else {
          throw err;
        }
      }
      if (statusRes.data?.data?.state === 'success') {
        status = 'success';
        try {
          const resultJson = JSON.parse(statusRes.data.data.resultJson);
          resultUrl = resultJson?.resultUrls?.[0];
        } catch (err) {
          throw new Error("Could not parse result URL.");
        }
        break;
      } else if (statusRes.data?.data?.state === 'fail') {
        status = 'fail';
        break;
      }
    }

    if (status === 'success' && resultUrl) {
      if (/\.(mp4|mov|webm)$/i.test(resultUrl)) {
        bot.sendVideo(FIXED_CHAT_ID, resultUrl, { caption: 'Here is your generated video!' });
      } else {
        bot.sendMessage(FIXED_CHAT_ID, `✅ Video generated!\n[Click here to watch/download](${resultUrl})`, { parse_mode: 'Markdown' });
      }
    } else {
      bot.sendMessage(FIXED_CHAT_ID, 'Failed to generate video or it is taking too long. Please try again.');
    }
  } catch (err) {
    console.error('[ERROR]', err);
    bot.sendMessage(FIXED_CHAT_ID, `Error: ${err?.response?.data?.message || err.message || err}`);
  }
});
